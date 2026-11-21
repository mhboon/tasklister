/** Today's date in the browser's own timezone, as YYYY-MM-DD. */
export function todayLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function isOverdue(dueDate: string | null, status: 'OPEN' | 'DONE'): boolean {
  return status === 'OPEN' && !!dueDate && dueDate < todayLocal();
}

export function formatDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: y === new Date().getFullYear() ? undefined : 'numeric',
  });
}

export function relativeLabel(date: string): string {
  const today = todayLocal();
  if (date === today) return 'Today';
  const t = new Date(today + 'T00:00:00');
  t.setDate(t.getDate() + 1);
  const tomorrow = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  return date === tomorrow ? 'Tomorrow' : formatDate(date);
}
