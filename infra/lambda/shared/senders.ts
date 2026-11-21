import { randomInt } from 'node:crypto';
import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables, queryAll } from './db';
import { normEmail } from './validate';
import type { UserRow } from './types';

/**
 * Extra sender addresses a person can act from (a work mailbox, say). They live in the
 * Mailboxes table next to the list addresses, under keys no list name can have (names
 * cannot contain '#'):
 *   alias#<email>  a verified address        -> the user it acts for
 *   claim#<code>   a pending claim, expiring -> the user, the address
 * A claim is turned into an alias when a mail *from that address*, passing DMARC, quotes
 * the code in its subject: that is the proof that the person controls the address.
 */
export const MAX_SENDER_ADDRESSES = 5;
export const CLAIM_HOURS = 24;

export interface SenderRow {
  name: string;
  userId: string;
  email: string;
  kind: 'ALIAS' | 'CLAIM';
  /** Claims only: when the code stops working (epoch seconds; DynamoDB's TTL removes the row later). */
  expiresAt?: number;
  verifiedAt?: string;
}

export const aliasKey = (email: string) => `alias#${normEmail(email)}`;
export const claimKey = (code: string) => `claim#${code}`;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const CODE_RE = /\bTL-([A-HJ-NP-Z2-9]{6})\b/i;

export function newClaimCode(): string {
  let c = '';
  for (let i = 0; i < 6; i++) c += ALPHABET[randomInt(ALPHABET.length)];
  return `TL-${c}`;
}

/** The claim code quoted in a mail subject, uppercased, or null. */
export function extractClaimCode(subject: string | undefined): string | null {
  const m = subject ? CODE_RE.exec(subject) : null;
  return m ? `TL-${m[1].toUpperCase()}` : null;
}

export const claimIsLive = (row: Pick<SenderRow, 'expiresAt'>, now = Date.now()): boolean =>
  (row.expiresAt ?? 0) * 1000 > now;

export async function userByEmail(email: string): Promise<UserRow | undefined> {
  const [row] = await queryAll<UserRow>({
    TableName: tables.users,
    IndexName: 'byEmail',
    KeyConditionExpression: 'email = :e',
    ExpressionAttributeValues: { ':e': normEmail(email) },
    Limit: 1,
  });
  return row;
}

export async function userById(userId: string): Promise<UserRow | undefined> {
  return (await ddb.send(new GetCommand({ TableName: tables.users, Key: { userId } }))).Item as UserRow | undefined;
}

export async function findAlias(email: string): Promise<SenderRow | undefined> {
  return (await ddb.send(new GetCommand({ TableName: tables.mailboxes, Key: { name: aliasKey(email) } }))).Item as
    | SenderRow
    | undefined;
}

/** Everything a user has registered: verified addresses and pending claims. */
export const sendersOf = (userId: string) =>
  queryAll<SenderRow>({
    TableName: tables.mailboxes,
    IndexName: 'byUser',
    KeyConditionExpression: 'userId = :u',
    ExpressionAttributeValues: { ':u': userId },
  });

/**
 * A mail from `from` (already known to pass DMARC) quoting `code`. Makes the address a
 * verified alias of whoever requested the code. False in every other case, including a
 * code for another address, an expired one, or an address somebody else has meanwhile
 * verified or that belongs to a registered user.
 */
export async function verifyClaim(code: string, from: string, now = Date.now()): Promise<boolean> {
  const email = normEmail(from);
  const claim = (await ddb.send(new GetCommand({ TableName: tables.mailboxes, Key: { name: claimKey(code) } }))).Item as
    | SenderRow
    | undefined;
  if (!claim || claim.kind !== 'CLAIM' || claim.email !== email || !claimIsLive(claim, now)) return false;
  if ((await userByEmail(email)) || (await findAlias(email))) return false;
  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: tables.mailboxes,
              Item: { name: aliasKey(email), userId: claim.userId, email, kind: 'ALIAS', verifiedAt: new Date(now).toISOString() },
              ConditionExpression: 'attribute_not_exists(#n)',
              ExpressionAttributeNames: { '#n': 'name' },
            },
          },
          { Delete: { TableName: tables.mailboxes, Key: { name: claimKey(code) } } },
        ],
      })
    );
    return true;
  } catch (e) {
    if ((e as Error).name === 'TransactionCanceledException') return false; // someone verified it first
    throw e;
  }
}
