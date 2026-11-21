import { useState } from 'react';
import { api, type Criticality, type Item } from '../lib/api';
import { isOverdue, relativeLabel } from '../lib/dates';
import { Linkified } from './Linkified';
import { ConfirmDialog } from './ConfirmDialog';
import { useAuth } from '../lib/useAuth';

const CRIT_LABEL: Record<Criticality, string> = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };

interface Props {
  item: Item;
  /** Called with the updated item (or null when it was deleted). */
  onChange: (item: Item | null) => void;
  showList?: boolean;
  onError: (message: string) => void;
}

/** One item with its subitems; used by the list, agenda and priority views. */
export function ItemRow({ item, onChange, showList, onError }: Props) {
  const isAdmin = !!useAuth().user?.isAdmin;
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newSub, setNewSub] = useState('');
  const [title, setTitle] = useState(item.title);
  const [notes, setNotes] = useState(item.notes ?? '');

  const done = item.status === 'DONE';
  const overdue = isOverdue(item.dueDate, item.status);
  const doneSubs = item.subitems.filter((s) => s.status === 'DONE').length;

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
    <li className={`item${done ? ' done' : ''}${overdue ? ' overdue' : ''}`}>
      <div className="item-main">
        <input
          type="checkbox"
          aria-label={done ? 'Mark as not completed' : 'Mark as completed'}
          checked={done}
          disabled={busy}
          onChange={() =>
            run(() => api.setItemStatus(item.listId, item.itemId, done ? 'OPEN' : 'DONE'), onChange)
          }
        />
        {/* A div, not a button: the title can contain links, and links can't nest in buttons. */}
        <div className="item-title" onClick={() => setOpen(!open)}>
          <span className="title-text"><Linkified text={item.title} /></span>
          <span className="badges">
            {item.dueDate && <span className={`badge due${overdue ? ' overdue' : ''}`}>{relativeLabel(item.dueDate)}</span>}
            {item.criticality && <span className={`badge crit-${item.criticality}`}>{CRIT_LABEL[item.criticality]}</span>}
            {item.recurringId && <span className="badge" title="Recurring">↻</span>}
            {item.subitems.length > 0 && <span className="badge muted-badge">{doneSubs}/{item.subitems.length}</span>}
            {showList && item.listName && <span className="badge list-badge">{item.listName}</span>}
          </span>
        </div>
        <button
          type="button"
          className="icon-btn expand-btn"
          aria-label={open ? 'Hide details' : 'Show details'}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? '▴' : '▾'}
        </button>
      </div>

      {open && (
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
      )}

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
          })
        }
      />
    </li>
  );
}
