import { useState } from 'react';
import { api, type Criticality, type Item } from '../lib/api';
import { useLoad } from '../lib/useLoad';
import { compareText } from '../lib/sort';
import { ItemRow } from '../components/ItemRow';
import { ItemDetail } from '../components/ItemDetail';

const GROUPS: { key: Criticality; label: string }[] = [
  { key: 'HIGH', label: 'High' },
  { key: 'MEDIUM', label: 'Medium' },
  { key: 'LOW', label: 'Low' },
];

export function PriorityPage() {
  const { data, setData, error, setError, loading } = useLoad(() => api.listPriority());
  // Kept apart from `data`: editing the priority can take an item out of this view.
  const [openItem, setOpenItem] = useState<Item | null>(null);

  const update = (updated: Item | null, old: Item) =>
    setData((cur) => {
      if (!cur) return cur;
      // Done or no-longer-prioritised items leave this view.
      const keep = updated && updated.status === 'OPEN' && updated.criticality;
      return keep ? cur.map((i) => (i.itemId === old.itemId ? updated : i)) : cur.filter((i) => i.itemId !== old.itemId);
    });

  return (
    <div className={`split${openItem ? ' has-detail' : ''}`}>
    <section className="page master">
      <h1>Priority</h1>
      <p className="muted small">Open items that have a priority, grouped by it. Items without one are not shown here.</p>
      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading…</p>}
      {!loading && (data ?? []).length === 0 && <p className="muted empty">No prioritised items.</p>}
      {GROUPS.map(({ key, label }) => {
        const items = (data ?? [])
          .filter((i) => i.criticality === key)
          .sort((a, b) => compareText(a.title, b.title));
        if (items.length === 0) return null;
        return (
          <div key={key} className="group">
            <h2><span className={`badge crit-${key}`}>{label}</span> <span className="muted small">{items.length}</span></h2>
            <ul className="items">
              {items.map((i) => (
                <ItemRow
                  key={`${i.listId}/${i.itemId}`}
                  item={i}
                  selected={openItem?.itemId === i.itemId}
                  showList
                  onOpen={() => setOpenItem(i)}
                  onError={setError}
                  onChange={(u) => {
                    update(u, i);
                    if (openItem?.itemId === i.itemId) setOpenItem(u);
                  }}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </section>
    {openItem && (
      <ItemDetail
        key={openItem.itemId}
        item={openItem}
        onError={setError}
        onClose={() => setOpenItem(null)}
        onChange={(u) => {
          update(u, openItem);
          setOpenItem(u);
        }}
      />
    )}
    </div>
  );
}
