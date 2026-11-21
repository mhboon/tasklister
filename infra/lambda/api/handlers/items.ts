import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables, newId, nowIso, batchDelete, UserError } from '../../shared/db';
import { requireUser, requireMember, listItemRows, getList } from '../../shared/access';
import { compareText } from '../../shared/text';
import { assembleItems, getItemDto, getItemRow, putItem } from '../../shared/items';
import { cleanName, cleanDate, cleanCriticality, cleanNotes } from '../../shared/validate';
import { accessibleLists } from './lists';
import type { Ctx, Status, ItemRow } from '../../shared/types';

const TITLE_MAX = 200;

async function requireItem(listId: string, itemId: string): Promise<ItemRow> {
  const row = await getItemRow(listId, itemId);
  if (!row || row.parentId) throw new UserError('Item not found.');
  return row;
}

function cleanStatus(s: unknown): Status {
  if (s !== 'OPEN' && s !== 'DONE') throw new UserError('Invalid status.');
  return s;
}

export async function listItems(ctx: Ctx, args: { listId: string }) {
  await requireMember(ctx, args.listId);
  return assembleItems(await listItemRows(args.listId));
}

/** Open items across every accessible list, filtered and annotated with the list name. */
async function openItemsAcross(ctx: Ctx, keep: (i: ReturnType<typeof assembleItems>[number]) => boolean) {
  const lists = await accessibleLists(ctx);
  const perList = await Promise.all(
    lists.map(async ({ list }) => assembleItems(await listItemRows(list.listId), list.name))
  );
  return perList.flat().filter((i) => i.status === 'OPEN' && keep(i));
}

export async function listAgenda(ctx: Ctx) {
  const items = await openItemsAcross(ctx, (i) => !!i.dueDate);
  // Oldest day first, alphabetical within a day. Whether an item is overdue depends on the viewer's
  // timezone "today", so the client decides that.
  return items.sort((a, b) => a.dueDate!.localeCompare(b.dueDate!) || compareText(a.title, b.title));
}

export async function listPriority(ctx: Ctx) {
  // Items without a criticality are intentionally not part of this view.
  return openItemsAcross(ctx, (i) => !!i.criticality);
}

export async function createItem(
  ctx: Ctx,
  args: { listId: string; title: string; notes?: string | null; dueDate?: string | null; criticality?: string | null }
) {
  await requireMember(ctx, args.listId);
  const row = await putItem({
    listId: args.listId,
    title: cleanName(args.title, 'Title', TITLE_MAX),
    notes: cleanNotes(args.notes),
    dueDate: args.dueDate ? cleanDate(args.dueDate) : undefined,
    criticality: args.criticality ? cleanCriticality(args.criticality) : undefined,
  });
  return getItemDto(args.listId, row.itemId);
}

export async function updateItem(
  ctx: Ctx,
  args: { listId: string; itemId: string; patch: { title?: string | null; notes?: string | null; dueDate?: string | null; criticality?: string | null } }
) {
  await requireMember(ctx, args.listId);
  await requireItem(args.listId, args.itemId);
  const { patch } = args;
  const sets: string[] = [];
  const removes: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};

  if (patch.title != null) {
    sets.push('#title = :title');
    names['#title'] = 'title';
    values[':title'] = cleanName(patch.title, 'Title', TITLE_MAX);
  }
  if ('notes' in patch) {
    const notes = cleanNotes(patch.notes);
    if (notes === undefined) removes.push('notes');
    else { sets.push('notes = :notes'); values[':notes'] = notes; }
  }
  // `key in patch` distinguishes "not sent" from an explicit null (= clear).
  if ('dueDate' in patch) {
    if (patch.dueDate == null) removes.push('dueDate');
    else { sets.push('dueDate = :due'); values[':due'] = cleanDate(patch.dueDate); }
  }
  if ('criticality' in patch) {
    if (patch.criticality == null) removes.push('criticality');
    else { sets.push('criticality = :crit'); values[':crit'] = cleanCriticality(patch.criticality); }
  }
  if (sets.length || removes.length) {
    const expr = [sets.length ? `SET ${sets.join(', ')}` : '', removes.length ? `REMOVE ${removes.join(', ')}` : '']
      .filter(Boolean)
      .join(' ');
    await ddb.send(
      new UpdateCommand({
        TableName: tables.items,
        Key: { listId: args.listId, itemId: args.itemId },
        UpdateExpression: expr,
        ConditionExpression: 'attribute_exists(itemId)',
        ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
        ExpressionAttributeValues: Object.keys(values).length ? values : undefined,
      })
    );
  }
  return getItemDto(args.listId, args.itemId);
}

async function setStatus(listId: string, key: string, status: Status) {
  await ddb.send(
    new UpdateCommand({
      TableName: tables.items,
      Key: { listId, itemId: key },
      UpdateExpression: status === 'DONE' ? 'SET #s = :s, completedAt = :c' : 'SET #s = :s REMOVE completedAt',
      ConditionExpression: 'attribute_exists(itemId)',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: status === 'DONE' ? { ':s': status, ':c': nowIso() } : { ':s': status },
    })
  );
}

export async function setItemStatus(ctx: Ctx, args: { listId: string; itemId: string; status: string }) {
  await requireMember(ctx, args.listId);
  await requireItem(args.listId, args.itemId);
  await setStatus(args.listId, args.itemId, cleanStatus(args.status));
  return getItemDto(args.listId, args.itemId);
}

/**
 * Moves an item and its subitems to another list the caller belongs to.
 * Copy first, then delete, so a failure part-way never loses the item.
 * A recurrence only watches its own target list, so a moved item is no longer
 * part of the recurrence.
 */
export async function moveItem(ctx: Ctx, args: { listId: string; itemId: string; targetListId: string }) {
  requireUser(ctx);
  await requireMember(ctx, args.listId);
  await requireMember(ctx, args.targetListId);
  const target = await getList(args.targetListId);
  if (!target) throw new UserError('List not found.');
  await requireItem(args.listId, args.itemId);
  if (args.targetListId === args.listId) return getItemDto(args.listId, args.itemId, target.name);

  const rows = (await listItemRows(args.listId)).filter((r) => r.itemId === args.itemId || r.parentId === args.itemId);
  for (const r of rows) {
    const { recurringId: _drop, ...rest } = r;
    void _drop;
    await ddb.send(new PutCommand({ TableName: tables.items, Item: { ...rest, listId: args.targetListId } }));
  }
  await batchDelete(tables.items, rows.map((r) => ({ listId: r.listId, itemId: r.itemId })));
  return getItemDto(args.targetListId, args.itemId, target.name);
}

export async function deleteItem(ctx: Ctx, args: { listId: string; itemId: string }) {
  requireUser(ctx);
  await requireMember(ctx, args.listId);
  await requireItem(args.listId, args.itemId);
  const rows = (await listItemRows(args.listId)).filter((r) => r.itemId === args.itemId || r.parentId === args.itemId);
  await batchDelete(tables.items, rows.map((r) => ({ listId: r.listId, itemId: r.itemId })));
  return true;
}

export async function addSubitem(ctx: Ctx, args: { listId: string; itemId: string; title: string }) {
  await requireMember(ctx, args.listId);
  await requireItem(args.listId, args.itemId);
  const row: ItemRow = {
    listId: args.listId,
    itemId: `${args.itemId}#${newId()}`,
    parentId: args.itemId,
    title: cleanName(args.title, 'Subitem', TITLE_MAX),
    status: 'OPEN',
    createdAt: nowIso(),
  };
  await ddb.send(new PutCommand({ TableName: tables.items, Item: row }));
  return getItemDto(args.listId, args.itemId);
}

export async function setSubitemStatus(
  ctx: Ctx,
  args: { listId: string; itemId: string; subitemId: string; status: string }
) {
  await requireMember(ctx, args.listId);
  await setStatus(args.listId, `${args.itemId}#${args.subitemId}`, cleanStatus(args.status)).catch((e) => {
    if (e.name === 'ConditionalCheckFailedException') throw new UserError('Subitem not found.');
    throw e;
  });
  return getItemDto(args.listId, args.itemId);
}

export async function deleteSubitem(ctx: Ctx, args: { listId: string; itemId: string; subitemId: string }) {
  requireUser(ctx);
  await requireMember(ctx, args.listId);
  await batchDelete(tables.items, [{ listId: args.listId, itemId: `${args.itemId}#${args.subitemId}` }]);
  return getItemDto(args.listId, args.itemId);
}
