import { useRef, useState } from 'react';
import { api, type Criticality, type Item } from '../lib/api';
import { Icon } from './Icon';
import { Linkified } from './Linkified';
import { ConfirmDialog } from './ConfirmDialog';
import { useAuth } from '../lib/useAuth';
import { useAppData } from '../lib/AppData';
import { relativeLabel } from '../lib/dates';
import { compareText } from '../lib/sort';

/** e.g. "21 Nov 2026, 14:09", in the viewer's own time zone. */
function formatCreated(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

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
  const canWork = !!useAuth().user?.canWork;
  const { lists, refresh } = useAppData();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newSub, setNewSub] = useState('');
  const [title, setTitle] = useState(item.title);
  const [notes, setNotes] = useState(item.notes ?? '');
  const [editingNotes, setEditingNotes] = useState(false);
  const dateRef = useRef<HTMLInputElement>(null);
  // Open subitems A–Z first, then the completed ones A–Z.
  const subitems = [...item.subitems].sort(
    (a, b) => Number(a.status === 'DONE') - Number(b.status === 'DONE') || compareText(a.title, b.title)
  );

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
        <button type="button" className="back-btn" aria-label="Back" title="Back" onClick={onClose}>←</button>
      </div>
      <div className="item-detail">
        <div className="title-row">
          <input
            type="checkbox"
            aria-label={item.status === 'DONE' ? 'Mark as not completed' : 'Mark as completed'}
            title={item.status === 'DONE' ? 'Mark as not completed' : 'Mark as completed'}
            checked={item.status === 'DONE'}
            disabled={busy}
            onChange={() => run(() => api.setItemStatus(item.listId, item.itemId, item.status === 'DONE' ? 'OPEN' : 'DONE'), onChange)}
          />
          <input
            className="detail-title"
            aria-label="Title"
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              const t = title.trim();
              if (t && t !== item.title) run(() => api.updateItem(item.listId, item.itemId, { title: t }), onChange);
              else setTitle(item.title);
            }}
          />
        </div>

        <label className="field">
          <select
            aria-label="List"
            title="List"
            value={item.listId}
            disabled={busy}
            onChange={(e) =>
              run(() => api.moveItem(item.listId, item.itemId, e.target.value), (moved) => {
                onChange(moved);
                void refresh(); // the open counts in the navigation change
              })
            }
          >
            {[...lists].sort((a, b) => (a.isInbox === b.isInbox ? compareText(a.name, b.name) : a.isInbox ? -1 : 1)).map((l) => (
              <option key={l.listId} value={l.listId}>{l.name}</option>
            ))}
          </select>
        </label>

        <div className="field">
          <div className="due-row">
            <button type="button" className="due-btn" aria-label="Due date" title="Due date" disabled={busy} onClick={() => dateRef.current?.showPicker?.()}>
              <Icon name="clock" size={18} />
              <span>{item.dueDate ? relativeLabel(item.dueDate) : 'No due date'}</span>
            </button>
            {item.dueDate && (
              <button
                type="button"
                className="icon-btn"
                aria-label="Clear due date"
                title="Clear due date"
                disabled={busy}
                onClick={() => run(() => api.updateItem(item.listId, item.itemId, { dueDate: null }), onChange)}
              >
                ✕
              </button>
            )}
            {/* The native picker, opened by the clock button above. */}
            <input
              ref={dateRef}
              className="visually-hidden"
              type="date"
              tabIndex={-1}
              aria-label="Due date"
              value={item.dueDate ?? ''}
              onChange={(e) => run(() => api.updateItem(item.listId, item.itemId, { dueDate: e.target.value || null }), onChange)}
            />
          </div>
        </div>

        <label className="field">
          <select
            aria-label="Priority"
            title="Priority"
            value={item.criticality ?? ''}
            onChange={(e) =>
              run(() => api.updateItem(item.listId, item.itemId, { criticality: (e.target.value || null) as Criticality | null }), onChange)
            }
          >
            <option value="">– priority not set –</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </label>

        <div className="field">
          <span>Subitems</span>
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
            <input placeholder="Add subitem" aria-label="New subitem" value={newSub} maxLength={200} onChange={(e) => setNewSub(e.target.value)} />
            <button type="submit" className="icon-submit" aria-label="Add subitem" title="Add subitem" disabled={busy || !newSub.trim()}>＋</button>
          </form>
          <ul className="subitems">
            {subitems.map((s) => (
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
                {canWork && <button
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
        </div>

        <div className="field">
          <span>Notes</span>
          {editingNotes ? (
            <>
              <textarea
                autoFocus
                value={notes}
                rows={5}
                maxLength={5000}
                aria-label="Notes"
                onChange={(e) => setNotes(e.target.value)}
              />
              <div className="notes-actions">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Save notes"
                  title="Save notes"
                  disabled={busy}
                  onClick={() => {
                    const n = notes.trim();
                    if (n === (item.notes ?? '')) setEditingNotes(false);
                    else run(() => api.updateItem(item.listId, item.itemId, { notes: n || null }), (u) => {
                      onChange(u);
                      setEditingNotes(false);
                    });
                  }}
                >
                  <Icon name="check" />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Discard changes"
                  title="Discard changes"
                  disabled={busy}
                  onClick={() => {
                    setNotes(item.notes ?? '');
                    setEditingNotes(false);
                  }}
                >
                  <Icon name="close" />
                </button>
              </div>
            </>
          ) : (
            <div className="notes-row">
              <div className="notes-view">
                {item.notes ? <Linkified text={item.notes} /> : <span className="muted">No notes</span>}
              </div>
              <button type="button" className="icon-btn" aria-label="Edit notes" title="Edit notes" onClick={() => setEditingNotes(true)}>
                <Icon name="pencil" />
              </button>
            </div>
          )}
        </div>

        <p className="created muted small">Created {formatCreated(item.createdAt)}</p>

        {canWork && (
          <button type="button" className="icon-btn delete-btn" aria-label="Delete item" title="Delete item" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" />
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
