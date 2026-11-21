import { PutCommand, UpdateCommand, TransactWriteCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables, newId, nowIso, queryAll, batchGet, batchDelete, UserError } from '../../shared/db';
import { requireAdmin, requireMember, requireOwner, getList, listItemRows, userNames, getMembership } from '../../shared/access';
import { cleanName, normEmail } from '../../shared/validate';
import { requireFolder } from './folders';
import { findUserByEmail } from './users';
import type { Ctx, ListRow, MemberRow } from '../../shared/types';

interface SummaryInput { list: ListRow; membership: MemberRow; memberCount: number; ownerName: string }

function summary({ list, membership, memberCount, ownerName }: SummaryInput, ctx: Ctx) {
  return {
    listId: list.listId,
    name: list.name,
    ownerId: list.ownerId,
    ownerName,
    isOwner: list.ownerId === ctx.userId,
    isInbox: !!list.isInbox,
    folderId: membership.folderId ?? null,
    memberCount,
  };
}

async function countMembers(listId: string): Promise<number> {
  const r = await ddb.send(
    new QueryCommand({
      TableName: tables.members,
      IndexName: 'byList',
      KeyConditionExpression: 'listId = :l',
      ExpressionAttributeValues: { ':l': listId },
      Select: 'COUNT',
    })
  );
  return r.Count ?? 0;
}

async function summaryFor(ctx: Ctx, listId: string) {
  const membership = await requireMember(ctx, listId);
  const list = await getList(listId);
  if (!list) throw new UserError('List not found.');
  const [memberCount, names] = await Promise.all([countMembers(listId), userNames([list.ownerId])]);
  return summary({ list, membership, memberCount, ownerName: names.get(list.ownerId)?.displayName ?? '' }, ctx);
}

/** Inbox first, then everything else alphabetically (case-insensitive). */
export function sortLists<T extends { name: string; isInbox: boolean }>(lists: T[]): T[] {
  return [...lists].sort((a, b) => {
    if (a.isInbox !== b.isInbox) return a.isInbox ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

/** Every list the caller is a member of, with their own membership row. */
export async function accessibleLists(ctx: Ctx): Promise<{ list: ListRow; membership: MemberRow }[]> {
  const memberships = await queryAll<MemberRow>({
    TableName: tables.members,
    KeyConditionExpression: 'userId = :u',
    ExpressionAttributeValues: { ':u': ctx.userId },
  });
  const lists = await batchGet<ListRow>(tables.lists, memberships.map((m) => ({ listId: m.listId })));
  const byId = new Map(lists.map((l) => [l.listId, l]));
  return memberships.flatMap((membership) => {
    const list = byId.get(membership.listId);
    return list ? [{ list, membership }] : [];
  });
}

export async function listLists(ctx: Ctx) {
  const rows = await accessibleLists(ctx);
  const [counts, names] = await Promise.all([
    Promise.all(rows.map((r) => countMembers(r.list.listId))),
    userNames(rows.map((r) => r.list.ownerId)),
  ]);
  return sortLists(
    rows.map((r, i) =>
      summary({ ...r, memberCount: counts[i], ownerName: names.get(r.list.ownerId)?.displayName ?? '' }, ctx)
    )
  );
}

export async function createList(ctx: Ctx, args: { name: string; folderId?: string | null }) {
  requireAdmin(ctx);
  const name = cleanName(args.name, 'List name');
  if (args.folderId) await requireFolder(ctx, args.folderId);
  const listId = newId();
  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        { Put: { TableName: tables.lists, Item: { listId, ownerId: ctx.userId, name, createdAt: nowIso() } } },
        {
          Put: {
            TableName: tables.members,
            Item: { userId: ctx.userId, listId, role: 'OWNER', folderId: args.folderId ?? undefined },
          },
        },
      ],
    })
  );
  return summaryFor(ctx, listId);
}

function assertNotInbox(list: ListRow | undefined): ListRow {
  if (!list) throw new UserError('List not found.');
  if (list.isInbox) throw new UserError("The Inbox can't be changed that way.");
  return list;
}

export async function renameList(ctx: Ctx, args: { listId: string; name: string }) {
  requireAdmin(ctx);
  await requireOwner(ctx, args.listId);
  assertNotInbox(await getList(args.listId));
  await ddb.send(
    new UpdateCommand({
      TableName: tables.lists,
      Key: { listId: args.listId },
      UpdateExpression: 'SET #n = :n',
      ExpressionAttributeNames: { '#n': 'name' },
      ExpressionAttributeValues: { ':n': cleanName(args.name, 'List name') },
    })
  );
  return summaryFor(ctx, args.listId);
}

export async function deleteList(ctx: Ctx, args: { listId: string }) {
  requireAdmin(ctx);
  await requireOwner(ctx, args.listId);
  assertNotInbox(await getList(args.listId));
  const [items, members] = await Promise.all([
    listItemRows(args.listId),
    queryAll<MemberRow>({
      TableName: tables.members,
      IndexName: 'byList',
      KeyConditionExpression: 'listId = :l',
      ExpressionAttributeValues: { ':l': args.listId },
    }),
  ]);
  await batchDelete(tables.items, items.map((i) => ({ listId: i.listId, itemId: i.itemId })));
  // Other members first, owner's row and the list itself last, so a
  // partial failure leaves the owner able to retry.
  await batchDelete(
    tables.members,
    members.filter((m) => m.userId !== ctx.userId).map((m) => ({ userId: m.userId, listId: m.listId }))
  );
  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        { Delete: { TableName: tables.members, Key: { userId: ctx.userId, listId: args.listId } } },
        { Delete: { TableName: tables.lists, Key: { listId: args.listId } } },
      ],
    })
  );
  return true;
}

/** Folders are personal: this only changes the caller's own placement. */
export async function moveList(ctx: Ctx, args: { listId: string; folderId?: string | null }) {
  requireAdmin(ctx);
  await requireMember(ctx, args.listId);
  if (args.folderId) await requireFolder(ctx, args.folderId);
  await ddb.send(
    new UpdateCommand({
      TableName: tables.members,
      Key: { userId: ctx.userId, listId: args.listId },
      ...(args.folderId
        ? { UpdateExpression: 'SET folderId = :f', ExpressionAttributeValues: { ':f': args.folderId } }
        : { UpdateExpression: 'REMOVE folderId' }),
    })
  );
  return summaryFor(ctx, args.listId);
}

async function membersOf(ctx: Ctx, listId: string) {
  const [list, rows] = await Promise.all([
    getList(listId),
    queryAll<MemberRow>({
      TableName: tables.members,
      IndexName: 'byList',
      KeyConditionExpression: 'listId = :l',
      ExpressionAttributeValues: { ':l': listId },
    }),
  ]);
  const names = await userNames(rows.map((r) => r.userId));
  return rows
    .map((r) => ({
      userId: r.userId,
      email: names.get(r.userId)?.email ?? '',
      displayName: names.get(r.userId)?.displayName ?? '',
      isOwner: r.userId === list?.ownerId,
    }))
    .sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || a.displayName.localeCompare(b.displayName));
}

export async function listMembers(ctx: Ctx, args: { listId: string }) {
  await requireMember(ctx, args.listId);
  return membersOf(ctx, args.listId);
}

export async function shareList(ctx: Ctx, args: { listId: string; email: string }) {
  requireAdmin(ctx);
  await requireOwner(ctx, args.listId);
  assertNotInbox(await getList(args.listId));
  const target = await findUserByEmail(normEmail(args.email));
  if (!target) {
    throw new UserError('No authorized user has that email. Ask an admin to add them first.');
  }
  if (!(await getMembership(target.userId, args.listId))) {
    await ddb
      .send(
        new PutCommand({
          TableName: tables.members,
          Item: { userId: target.userId, listId: args.listId, role: 'MEMBER' },
          ConditionExpression: 'attribute_not_exists(userId)',
        })
      )
      .catch((e) => {
        if (e.name !== 'ConditionalCheckFailedException') throw e;
      });
  }
  return membersOf(ctx, args.listId);
}

export async function unshareList(ctx: Ctx, args: { listId: string; userId: string }) {
  requireAdmin(ctx);
  const mine = await requireMember(ctx, args.listId);
  const list = assertNotInbox(await getList(args.listId));
  if (args.userId === list.ownerId) throw new UserError("The owner can't be removed. Delete the list instead.");
  if (args.userId !== ctx.userId && mine.role !== 'OWNER') throw new UserError('Only the list owner can remove others.');
  await ddb.send(new DeleteCommand({ TableName: tables.members, Key: { userId: args.userId, listId: args.listId } }));
  return true;
}
