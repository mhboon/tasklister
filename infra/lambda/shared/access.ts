import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables, UserError, queryAll, batchGet } from './db';
import type { Ctx, ItemRow, ListRow, MemberRow, UserRow } from './types';

export async function getMembership(userId: string, listId: string): Promise<MemberRow | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: tables.members, Key: { userId, listId } }));
  return res.Item as MemberRow | undefined;
}

/** Any member (owner or invited) may read and edit items. */
export async function requireMember(ctx: Ctx, listId: string): Promise<MemberRow> {
  const m = await getMembership(ctx.userId, listId);
  // Same message for "no such list" and "not yours": don't leak existence.
  if (!m) throw new UserError('List not found.');
  return m;
}

export async function requireOwner(ctx: Ctx, listId: string): Promise<MemberRow> {
  const m = await requireMember(ctx, listId);
  if (m.role !== 'OWNER') throw new UserError('Only the list owner can do that.');
  return m;
}

export async function getList(listId: string): Promise<ListRow | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: tables.lists, Key: { listId } }));
  return res.Item as ListRow | undefined;
}

/** Guests may only work on items of lists shared with them. */
export function requireAdmin(ctx: Ctx): void {
  if (!ctx.isAdmin) throw new UserError('Only admins can do that.');
}

export const inboxId = (userId: string) => `inbox-${userId}`;

export async function userNames(ids: string[]): Promise<Map<string, UserRow>> {
  const unique = [...new Set(ids)];
  const rows = await batchGet<UserRow>(tables.users, unique.map((userId) => ({ userId })));
  return new Map(rows.map((r) => [r.userId, r]));
}

export async function listItemRows(listId: string): Promise<ItemRow[]> {
  return queryAll<ItemRow>({
    TableName: tables.items,
    KeyConditionExpression: 'listId = :l',
    ExpressionAttributeValues: { ':l': listId },
  });
}
