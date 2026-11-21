import { useState } from 'react';
import { api, type Criticality, type Item } from '../lib/api';
import { ConfirmDialog } from './ConfirmDialog';
import { useAuth } from '../lib/useAuth';

interface Props {
  item: Item;
  /** Called with the updated item (or null when it was deleted). */
  onChange: (item: Item | null) => void;
  onError: (message: string) => void;
  onClose: () => void;
}

/**
 * Everything about one item. Shown beside the list on a wide screen and as
 * a screen of its own on a phone. Mount it with `key={item.itemId}` so the
 * text fields reset when another item is opened.
 */
export function ItemDetail({ item, onChange, onError, onClose }: Props) {
  const isAdmin = !!useAuth().user?.isAdmin;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newSub, setNewSub] = useState('');
  const [title, setTitle] = useState(item.title);
  const [notes, setNotes] = useState(item.notes ?? '');

  async function run<T>(fn: () => Promise<T>, then: (r: T) => void) {
    setBusy(true);
    try {
      then(await fn());
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="detail-pane" aria-label="Item details">
      <div className="detail-head">
        <button type="button" className="back-btn" onClick={onClose}>← Back</button>
      </div>
      <div className="item-detail">
        <ul className="subitems">
          {item.subitems.map((s) => (
            <li key={s.subitemId} className={s.status === 'DONE' ? 'done' : ''}>
              <input
                type="checkbox"
                aria-label={`Subitem ${s.title}`}
                checked={s.status === 'DONE'}
                disabled={busy}
                onChange={() =>
                  run(() => api.setSubitemStatus(item.listId, item.itemId, s.subitemId, s.status === 'DONE' ? 'OPEN' : 'DONE'), onChange)
                }
              />
              <span className="sub-title">{s.title}</span>
              {isAdmin && <button
                type="button"
                className="icon-btn"
                aria-label={`Remove subitem ${s.title}`}
                disabled={busy}
                onClick={() => run(() => api.deleteSubitem(item.listId, item.itemId, s.subitemId), onChange)}
              >
                ✕
              </button>}
            </li>
          ))}
        </ul>

        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const t = newSub.trim();
            if (!t) return;
            run(() => api.addSubitem(item.listId, item.itemId, t), (r) => {
              setNewSub('');
              onChange(r);
            });
          }}
        >
          <input placeholder="Add subitem" value={newSub} maxLength={200} onChange={(e) => setNewSub(e.target.value)} />
          <button type="submit" disabled={busy || !newSub.trim()}>Add</button>
        </form>

        <div className="edit-grid">
          <label className="field">
            <span>Title</span>
            <input
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                const t = title.trim();
                if (t && t !== item.title) run(() => api.updateItem(item.listId, item.itemId, { title: t }), onChange);
                else setTitle(item.title);
              }}
            />
          </label>
          <label className="field">
            <span>Due date</span>
            <input
              type="date"
              value={item.dueDate ?? ''}
              onChange={(e) => run(() => api.updateItem(item.listId, item.itemId, { dueDate: e.target.value || null }), onChange)}
            />
          </label>
          <label className="field">
            <span>Criticality</span>
            <select
              value={item.criticality ?? ''}
              onChange={(e) =>
                run(() => api.updateItem(item.listId, item.itemId, { criticality: (e.target.value || null) as Criticality | null }), onChange)
              }
            >
              <option value="">None</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </label>
        </div>

        <label className="field">
          <span>Notes</span>
          <textarea
            value={notes}
            rows={3}
            maxLength={5000}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              const n = notes.trim();
              if (n !== (item.notes ?? '')) run(() => api.updateItem(item.listId, item.itemId, { notes: n || null }), onChange);
            }}
          />
        </label>

        {isAdmin && (
          <button type="button" className="icon-btn delete-btn" aria-label="Delete item" title="Delete item" onClick={() => setConfirmDelete(true)}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
            </svg>
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this item?"
        message={`“${item.title}”${item.subitems.length ? ` and its ${item.subitems.length} subitem(s)` : ''} will be removed for everyone who has access to this list.`}
        confirmLabel="Delete"
        danger
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() =>
          run(() => api.deleteItem(item.listId, item.itemId), () => {
            setConfirmDelete(false);
            onChange(null);
            onClose();
          })
        }
      />
    </aside>
  );
}
