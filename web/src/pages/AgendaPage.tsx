import { api, type Item } from '../lib/api';
import { useLoad } from '../lib/useLoad';
import { ItemRow } from '../components/ItemRow';
import { isOverdue, relativeLabel } from '../lib/dates';

export function AgendaPage() {
  const { data, setData, error, setError, loading } = useLoad(() => api.listAgenda());

  const update = (updated: Item | null, old: Item) =>
    setData((cur) => {
      if (!cur) return cur;
      // Completed or undated items leave the agenda; anything else is updated in place.
      const keep = updated && updated.status === 'OPEN' && updated.dueDate;
      const next = keep ? cur.map((i) => (i.itemId === old.itemId ? updated : i)) : cur.filter((i) => i.itemId !== old.itemId);
      return [...next].sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
    });

  // Group by date, oldest first (the server already sorted them).
  const groups: { date: string; items: Item[] }[] = [];
  for (const i of data ?? []) {
    const g = groups[groups.length - 1];
    if (g && g.date === i.dueDate) g.items.push(i);
    else groups.push({ date: i.dueDate!, items: [i] });
  }

  return (
    <section className="page">
      <h1>Agenda</h1>
      <p className="muted small">Open items with a due date, oldest first. Overdue items are red.</p>
      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading…</p>}
      {!loading && groups.length === 0 && <p className="muted empty">Nothing is scheduled.</p>}
      {groups.map((g) => {
        const overdue = isOverdue(g.date, 'OPEN');
        return (
          <div key={g.date} className="group">
            <h2 className={overdue ? 'overdue-heading' : ''}>
              {relativeLabel(g.date)} {overdue && <span className="badge due overdue">overdue</span>}
            </h2>
            <ul className="items">
              {g.items.map((i) => (
                <ItemRow key={`${i.listId}/${i.itemId}`} item={i} showList onError={setError} onChange={(u) => update(u, i)} />
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
