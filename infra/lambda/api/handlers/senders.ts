import { PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables, UserError } from '../../shared/db';
import { aliasKey, claimIsLive, claimKey, CLAIM_HOURS, findAlias, MAX_SENDER_ADDRESSES, newClaimCode, sendersOf, userByEmail, type SenderRow } from '../../shared/senders';
import { compareText } from '../../shared/text';
import { normEmail } from '../../shared/validate';
import type { Ctx } from '../../shared/types';

const dto = (r: SenderRow) =>
  r.kind === 'ALIAS'
    ? { email: r.email, status: 'VERIFIED', code: null, expiresAt: null }
    : {
        email: r.email,
        status: claimIsLive(r) ? 'PENDING' : 'EXPIRED',
        code: claimIsLive(r) ? r.name.slice('claim#'.length) : null,
        expiresAt: new Date((r.expiresAt ?? 0) * 1000).toISOString(),
      };

export async function listSenderAddresses(ctx: Ctx) {
  const rows = await sendersOf(ctx.userId);
  return rows.sort((a, b) => compareText(a.email, b.email)).map(dto);
}

// One message for every refusal: it must not reveal who is registered.
const REFUSED = "That address can't be used.";

/** Starts (or restarts) a claim on an address: the app then shows a code to send from it. */
export async function addSenderAddress(ctx: Ctx, args: { email: string }) {
  const email = normEmail(args.email ?? '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) throw new UserError('Enter a valid email address.');
  const domain = process.env.MAIL_DOMAIN?.toLowerCase();
  if (email === ctx.email || (domain && email.endsWith(`@${domain}`))) throw new UserError(REFUSED);
  if ((await userByEmail(email)) || (await findAlias(email))) throw new UserError(REFUSED);

  const mine = await sendersOf(ctx.userId);
  const others = mine.filter((r) => r.email !== email);
  if (others.filter((r) => r.kind === 'ALIAS' || claimIsLive(r)).length + 1 > MAX_SENDER_ADDRESSES) {
    throw new UserError(`You can have at most ${MAX_SENDER_ADDRESSES} extra sender addresses.`);
  }
  // A new request replaces this person's earlier one for the same address.
  for (const r of mine.filter((r) => r.email === email)) {
    await ddb.send(new DeleteCommand({ TableName: tables.mailboxes, Key: { name: r.name } }));
  }
  const code = newClaimCode();
  const row: SenderRow = {
    name: claimKey(code),
    userId: ctx.userId,
    email,
    kind: 'CLAIM',
    expiresAt: Math.floor(Date.now() / 1000) + CLAIM_HOURS * 3600,
  };
  await ddb.send(new PutCommand({ TableName: tables.mailboxes, Item: row, ConditionExpression: 'attribute_not_exists(#n)', ExpressionAttributeNames: { '#n': 'name' } }));
  return dto(row);
}

export async function removeSenderAddress(ctx: Ctx, args: { email: string }) {
  const email = normEmail(args.email ?? '');
  for (const r of (await sendersOf(ctx.userId)).filter((r) => r.email === email)) {
    await ddb.send(new DeleteCommand({ TableName: tables.mailboxes, Key: { name: r.kind === 'ALIAS' ? aliasKey(email) : r.name } }));
  }
  return true;
}
