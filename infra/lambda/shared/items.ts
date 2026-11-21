import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables, newId, nowIso } from './db';
import { listItemRows } from './access';
import type { Criticality, ItemRow } from './types';

export interface ItemDto {
  itemId: string;
  listId: string;
  listName?: string;
  title: string;
  status: 'OPEN' | 'DONE';
  dueDate: string | null;
  criticality: Criticality | null;
  recurringId: string | null;
  subitems: { subitemId: string; title: string; status: 'OPEN' | 'DONE' }[];
  createdAt: string;
  completedAt: string | null;
}

/** Folds a list's flat rows (items + subitems) into items with subitems. */
export function assembleItems(rows: ItemRow[], listName?: string): ItemDto[] {
  const subs = new Map<string, ItemRow[]>();
  for (const r of rows) {
    if (r.parentId) {
      const arr = subs.get(r.parentId) ?? [];
      arr.push(r);
      subs.set(r.parentId, arr);
    }
  }
  return rows
    .filter((r) => !r.parentId)
    .sort((a, b) => a.itemId.localeCompare(b.itemId))
    .map((r) => ({
      itemId: r.itemId,
      listId: r.listId,
      listName,
      title: r.title,
      status: r.status,
      dueDate: r.dueDate ?? null,
      criticality: r.criticality ?? null,
      recurringId: r.recurringId ?? null,
      createdAt: r.createdAt,
      completedAt: r.completedAt ?? null,
      subitems: (subs.get(r.itemId) ?? [])
        .sort((a, b) => a.itemId.localeCompare(b.itemId))
        .map((s) => ({ subitemId: s.itemId.split('#')[1], title: s.title, status: s.status })),
    }));
}

export async function getItemDto(listId: string, itemId: string, listName?: string): Promise<ItemDto> {
  const rows = (await listItemRows(listId)).filter((r) => r.itemId === itemId || r.parentId === itemId);
  const [item] = assembleItems(rows, listName);
  return item;
}

export async function getItemRow(listId: string, itemId: string): Promise<ItemRow | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: tables.items, Key: { listId, itemId } }));
  return res.Item as ItemRow | undefined;
}

export async function putItem(args: {
  listId: string;
  title: string;
  dueDate?: string;
  criticality?: Criticality;
  recurringId?: string;
}): Promise<ItemRow> {
  const row: ItemRow = {
    listId: args.listId,
    itemId: newId(),
    title: args.title,
    status: 'OPEN',
    dueDate: args.dueDate,
    criticality: args.criticality,
    recurringId: args.recurringId,
    createdAt: nowIso(),
  };
  await ddb.send(new PutCommand({ TableName: tables.items, Item: row }));
  return row;
}
