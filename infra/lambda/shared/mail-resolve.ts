import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { SESMessage } from 'aws-lambda';
import { ddb, tables } from './db';
import { getMembership, inboxId } from './access';
import { localPartAt, parseAddress } from './inbound';
import { normalizeMailName } from './mailnames';
import { findAlias, userByEmail, userById } from './senders';
import type { MailboxRow, UserRow } from './types';

const cognito = new CognitoIdentityProviderClient({});
export const MAILS_PER_HOUR = 30;

/** The person a mail is from: the owner of that address, or of a verified extra sender address. */
async function senderFor(email: string): Promise<UserRow | undefined> {
  const primary = await userByEmail(email);
  if (primary) return primary;
  const alias = await findAlias(email);
  return alias ? userById(alias.userId) : undefined;
}

/** A disabled account must not be able to add items by mail either. */
async function isEnabled(email: string): Promise<boolean> {
  try {
    const r = await cognito.send(new AdminGetUserCommand({ UserPoolId: process.env.USER_POOL_ID, Username: email }));
    return r.Enabled !== false;
  } catch {
    return false; // unknown to Cognito: not a user
  }
}

export interface Resolved {
  userId: string;
  /** Lists that will get an item (an Inbox for `me@`, a list for its own address). */
  listIds: string[];
}

/**
 * Who sent this and where it should go. Null means "drop it" for every
 * possible reason: unknown or disabled sender, nothing addressed to us that
 * the sender may use. The caller never says why.
 */
export async function resolveMail(message: SESMessage, domain: string): Promise<Resolved | null> {
  // DMARC is evaluated for the visible From address, so that is the identity we trust.
  const from = parseAddress(message.mail.commonHeaders?.from?.[0]);
  if (!from) return null;
  const sender = await senderFor(from);
  // The account's own (Cognito) address decides whether it is enabled, whatever address the mail came from.
  if (!sender || !(await isEnabled(sender.email))) return null;

  const listIds = new Set<string>();
  for (const recipient of message.receipt.recipients) {
    const local = localPartAt(recipient, domain);
    if (!local) continue;
    if (local === 'me') {
      // Guests have no Inbox, so they have no personal address.
      if (await getMembership(sender.userId, inboxId(sender.userId))) listIds.add(inboxId(sender.userId));
      continue;
    }
    const name = normalizeMailName(local);
    if (!name) continue;
    const box = (await ddb.send(new GetCommand({ TableName: tables.mailboxes, Key: { name } }))).Item as MailboxRow | undefined;
    if (box && (await getMembership(sender.userId, box.listId))) listIds.add(box.listId);
  }
  return listIds.size ? { userId: sender.userId, listIds: [...listIds] } : null;
}

/** Counts this mail against the sender's hourly allowance; false once it is used up. */
export async function takeMailAllowance(userId: string, now = Date.now()): Promise<boolean> {
  const hour = Math.floor(now / 3_600_000);
  const r = await ddb.send(
    new UpdateCommand({
      TableName: tables.mailboxes,
      Key: { name: `rate#${userId}#${hour}` }, // '#' can't occur in a list address name
      UpdateExpression: 'ADD n :one SET expiresAt = :exp',
      ExpressionAttributeValues: { ':one': 1, ':exp': Math.floor(now / 1000) + 2 * 3600 },
      ReturnValues: 'UPDATED_NEW',
    })
  );
  return Number(r.Attributes?.n ?? 1) <= MAILS_PER_HOUR;
}
