import type { Criticality, Item } from './api';

/** Case-insensitive alphabetical comparison, used for every A–Z ordering. */
export function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

export type SortKey =
  | 'alpha-asc' | 'alpha-desc'
  | 'created-asc' | 'created-desc'
  | 'priority-asc' | 'priority-desc'
  | 'due-asc' | 'due-desc';

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'alpha-asc', label: 'A → Z' },
  { key: 'alpha-desc', label: 'Z → A' },
  { key: 'created-desc', label: 'Newest first' },
  { key: 'created-asc', label: 'Oldest first' },
  { key: 'priority-asc', label: 'Priority: high → low' },
  { key: 'priority-desc', label: 'Priority: low → high' },
  { key: 'due-asc', label: 'Due: oldest → newest' },
  { key: 'due-desc', label: 'Due: newest → oldest' },
];

const RANK: Record<Criticality, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/**
 * Ascending puts items without a priority / due date last; descending is the
 * exact reverse, so they come first.
 */
function withMissingLast<T>(a: T | null, b: T | null, cmp: (x: T, y: T) => number, desc: boolean): number {
  if (a == null && b == null) return 0;
  if (a == null) return desc ? -1 : 1;
  if (b == null) return desc ? 1 : -1;
  return desc ? -cmp(a, b) : cmp(a, b);
}

export function compareItems(key: SortKey, a: Item, b: Item): number {
  const [field, dir] = key.split('-') as [string, 'asc' | 'desc'];
  const desc = dir === 'desc';
  let r = 0;
  if (field === 'alpha') r = desc ? -compareText(a.title, b.title) : compareText(a.title, b.title);
  else if (field === 'created') r = desc ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt);
  else if (field === 'priority') {
    r = withMissingLast(a.criticality, b.criticality, (x, y) => RANK[x] - RANK[y], desc);
  } else if (field === 'due') r = withMissingLast(a.dueDate, b.dueDate, (x, y) => x.localeCompare(y), desc);
  // Ties fall back to A–Z so the order is stable and predictable.
  return r || compareText(a.title, b.title);
}

export const sortItems = (items: Item[], key: SortKey): Item[] => [...items].sort((a, b) => compareItems(key, a, b));

/** Inbox: newest first. Everything else: A → Z. */
export const defaultSort = (isInbox: boolean): SortKey => (isInbox ? 'created-desc' : 'alpha-asc');

const storageKey = (userId: string, listId: string) => `tasklister:sort:${userId}:${listId}`;

/** The user's remembered sort for a list (per user, kept in this browser). */
export function loadSort(userId: string, listId: string, isInbox: boolean): SortKey {
  try {
    const v = localStorage.getItem(storageKey(userId, listId));
    if (v && SORT_OPTIONS.some((o) => o.key === v)) return v as SortKey;
  } catch { /* storage unavailable: fall back to the default */ }
  return defaultSort(isInbox);
}

export function saveSort(userId: string, listId: string, key: SortKey): void {
  try {
    localStorage.setItem(storageKey(userId, listId), key);
  } catch { /* ignore */ }
}

const targetKey = (userId: string) => `tasklister:share-target:${userId}`;

/** The list last used as a share target, so the next share defaults to it. */
export function loadShareTarget(userId: string): string | null {
  try { return localStorage.getItem(targetKey(userId)); } catch { return null; }
}

export function saveShareTarget(userId: string, listId: string): void {
  try { localStorage.setItem(targetKey(userId), listId); } catch { /* ignore */ }
}
