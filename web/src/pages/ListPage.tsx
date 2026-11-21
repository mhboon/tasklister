import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { api, type Criticality, type Item, type Member } from '../lib/api';
import { useAppData } from '../lib/AppData';
import { useAuth } from '../lib/useAuth';
import { useLoad } from '../lib/useLoad';
import { ItemRow } from '../components/ItemRow';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PromptDialog } from '../components/PromptDialog';

export function ListPage() {
  const { listId = '' } = useParams();
  const { me, lists, folders, refresh, loading: appLoading } = useAppData();
  const navigate = useNavigate();
  const isAdmin = !!useAuth().user?.isAdmin;
  const list = lists.find((l) => l.listId === listId);

  const { data: items, setData: setItems, error, setError, loading } = useLoad(() => api.listItems(listId), listId);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [crit, setCrit] = useState<Criticality | ''>('');
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirm, setConfirm] = useState<'delete' | 'leave' | null>(null);
  const [sharing, setSharing] = useState(false);

  if (appLoading) return <p className="muted pad">Loading…</p>;
  if (!list) return <Navigate to="/" replace />;

  const replace = (updated: Item | null, old: Item) =>
    setItems((cur) => (cur ? (updated ? cur.map((i) => (i.itemId === old.itemId ? updated : i)) : cur.filter((i) => i.itemId !== old.itemId)) : cur));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setAdding(true);
    try {
      const created = await api.createItem(listId, t, due || null, crit || null);
      setItems((cur) => [...(cur ?? []), created]);
      setTitle('');
      setDue('');
      setCrit('');
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAdding(false);
    }
  }

  const open = (items ?? []).filter((i) => i.status === 'OPEN');
  const done = (items ?? []).filter((i) => i.status === 'DONE');

  return (
    <section className="page">
      <div className="page-head">
        <h1>{list.name}</h1>
        {!list.isInbox && isAdmin && (
          <div className="head-actions">
            {list.isOwner && <button type="button" onClick={() => setRenaming(true)}>Rename</button>}
            {list.isOwner && <button type="button" onClick={() => setSharing(!sharing)} aria-expanded={sharing}>Share{list.memberCount > 1 ? ` (${list.memberCount})` : ''}</button>}
            {list.isOwner ? (
              <button type="button" className="danger" onClick={() => setConfirm('delete')}>Delete</button>
            ) : (
              <button type="button" className="danger" onClick={() => setConfirm('leave')}>Leave</button>
            )}
          </div>
        )}
      </div>
      {!list.isOwner && <p className="muted small">Shared by {list.ownerName}</p>}

      {!list.isInbox && isAdmin && (
        <label className="field inline">
          <span>Folder</span>
          <select
            value={list.folderId ?? ''}
            onChange={async (e) => {
              try {
                await api.moveList(listId, e.target.value || null);
                await refresh();
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            <option value="">(top level)</option>
            {folders.map((f) => <option key={f.folderId} value={f.folderId}>{f.name}</option>)}
          </select>
        </label>
      )}

      {sharing && list.isOwner && <SharePanel listId={listId} onChanged={refresh} />}

      <form className="add-form" onSubmit={add}>
        <input placeholder="Add an item…" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} aria-label="New item title" />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
        <select value={crit} onChange={(e) => setCrit(e.target.value as Criticality | '')} aria-label="Criticality">
          <option value="">No priority</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
        <button type="submit" className="primary" disabled={adding || !title.trim()}>Add</button>
      </form>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading…</p>}
      {!loading && items && (
        <>
          {open.length === 0 && <p className="muted empty">Nothing to do here.</p>}
          <ul className="items">
            {open.map((i) => <ItemRow key={i.itemId} item={i} onChange={(u) => replace(u, i)} onError={setError} />)}
          </ul>
          {done.length > 0 && (
            <details className="completed">
              <summary>Completed ({done.length})</summary>
              <ul className="items">
                {done.map((i) => <ItemRow key={i.itemId} item={i} onChange={(u) => replace(u, i)} onError={setError} />)}
              </ul>
            </details>
          )}
        </>
      )}

      <PromptDialog
        open={renaming}
        title="Rename list"
        label="Name"
        initial={list.name}
        confirmLabel="Rename"
        onCancel={() => setRenaming(false)}
        onSubmit={async (name) => {
          await api.renameList(listId, name);
          await refresh();
          setRenaming(false);
        }}
      />
      <ConfirmDialog
        open={confirm !== null}
        title={confirm === 'delete' ? 'Delete this list?' : 'Leave this list?'}
        message={
          confirm === 'delete'
            ? `“${list.name}” and all its items will be deleted${list.memberCount > 1 ? ` for all ${list.memberCount} people it is shared with` : ''}. This can't be undone.`
            : `You will no longer see “${list.name}”. ${list.ownerName} can share it with you again.`
        }
        confirmLabel={confirm === 'delete' ? 'Delete list' : 'Leave list'}
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          try {
            if (confirm === 'delete') await api.deleteList(listId);
            else if (me) await api.unshareList(listId, me.userId);
            setConfirm(null);
            await refresh();
            navigate('/');
          } catch (err) {
            setConfirm(null);
            setError((err as Error).message);
          }
        }}
      />
    </section>
  );
}

function SharePanel({ listId, onChanged }: { listId: string; onChanged: () => Promise<void> }) {
  const { data: members, setData, error, setError } = useLoad(() => api.listMembers(listId), listId);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      setData(await api.shareList(listId, email));
      setEmail('');
      setError(null);
      await onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(m: Member) {
    try {
      await api.unshareList(listId, m.userId);
      setData((cur) => (cur ? cur.filter((x) => x.userId !== m.userId) : cur));
      await onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="card share-panel">
      <h2>Shared with</h2>
      <ul className="members">
        {(members ?? []).map((m) => (
          <li key={m.userId}>
            <span>{m.displayName} <span className="muted small">{m.email}</span>{m.isOwner && <span className="badge"> owner</span>}</span>
            {!m.isOwner && <button type="button" className="icon-btn" aria-label={`Remove ${m.displayName}`} onClick={() => remove(m)}>✕</button>}
          </li>
        ))}
      </ul>
      <form className="inline-form" onSubmit={invite}>
        <input type="email" placeholder="Email of an existing user" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <button type="submit" disabled={busy || !email}>Share</button>
      </form>
      <p className="muted small">Everyone on the list can add, complete and remove items. Only you can rename, share or delete it.</p>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
