import { useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, type ListSummary, type Item, type Member } from '../lib/api';
import { useAppData } from '../lib/AppData';
import { useAuth } from '../lib/useAuth';
import { useLoad } from '../lib/useLoad';
import { ItemRow } from '../components/ItemRow';
import { ItemDetail } from '../components/ItemDetail';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PromptDialog } from '../components/PromptDialog';
import { Icon } from '../components/Icon';
import { SortSelect } from '../components/SortSelect';
import { compareText, loadSort, saveSort, sortItems, type SortKey } from '../lib/sort';

export function ListPage() {
  const { listId = '' } = useParams();
  const { me, lists, folders, mailDomain, refresh, loading: appLoading } = useAppData();
  const navigate = useNavigate();
  // Which item / the settings screen is open lives in the URL, so Back closes it.
  const [params, setParams] = useSearchParams();
  const openItemId = params.get('item');
  const settingsOpen = params.get('settings') === '1';
  const show = (next: Record<string, string | null>) =>
    setParams((cur) => {
      const n = new URLSearchParams(cur);
      for (const [k, v] of Object.entries(next)) {
        if (v === null) n.delete(k);
        else n.set(k, v);
      }
      return n;
    });
  const canWork = !!useAuth().user?.canWork;
  const list = lists.find((l) => l.listId === listId);

  const { data: items, setData: setItems, error, setError, loading } = useLoad(() => api.listItems(listId), listId);
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirm, setConfirm] = useState<'delete' | 'leave' | null>(null);
  const [sharing, setSharing] = useState(false);
  const [sortOverride, setSortOverride] = useState<{ listId: string; key: SortKey } | null>(null);

  const sort: SortKey =
    sortOverride?.listId === listId ? sortOverride.key : loadSort(me?.userId ?? '', listId, !!list?.isInbox);
  function changeSort(key: SortKey) {
    setSortOverride({ listId, key });
    if (me) saveSort(me.userId, listId, key);
  }

  if (appLoading) return <p className="muted pad">Loading…</p>;
  if (!list) return <Navigate to="/" replace />;

  const replace = (updated: Item | null, old: Item) =>
    setItems((cur) => (cur ? (updated && updated.listId === listId ? cur.map((i) => (i.itemId === old.itemId ? updated : i)) : cur.filter((i) => i.itemId !== old.itemId)) : cur));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setAdding(true);
    try {
      const created = await api.createItem(listId, t);
      setItems((cur) => [...(cur ?? []), created]);
      setTitle('');
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAdding(false);
    }
  }

  const open = sortItems((items ?? []).filter((i) => i.status === 'OPEN'), sort);
  const done = sortItems((items ?? []).filter((i) => i.status === 'DONE'), sort);
  const selected = (items ?? []).find((i) => i.itemId === openItemId) ?? null;
  const canSettings = !list.isInbox && canWork;

  const row = (i: Item) => (
    <ItemRow
      key={i.itemId}
      item={i}
      selected={i.itemId === openItemId}
      onOpen={() => show({ item: i.itemId })}
      onChange={(u) => replace(u, i)}
      onError={setError}
    />
  );

  const dialogs = (
    <>
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
    </>
  );

  // Settings are a screen of their own: the items are not shown next to them.
  if (settingsOpen && canSettings) {
    return (
      <section className="page">
        <div className="page-head">
          <button type="button" className="back-btn" aria-label="Back" title="Back" onClick={() => show({ settings: null })}>←</button>
          <h1>{list.name}</h1>
        </div>
        <div className="card settings-panel">
          <h2>List settings</h2>
          <label className="field">
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
          {list.isOwner && mailDomain && <MailSettings list={list} domain={mailDomain} onChanged={refresh} />}
          <div className="head-actions">
            {list.isOwner && (
              <button type="button" className="tool-btn" onClick={() => setRenaming(true)}>
                <Icon name="pencil" /><small>Rename</small>
              </button>
            )}
            {list.isOwner && (
              <button type="button" className="tool-btn" onClick={() => setSharing(!sharing)} aria-expanded={sharing}>
                <Icon name="people" /><small>Share{list.memberCount > 1 ? ` (${list.memberCount})` : ''}</small>
              </button>
            )}
            {list.isOwner ? (
              <button type="button" className="tool-btn danger" onClick={() => setConfirm('delete')}>
                <Icon name="trash" /><small>Delete</small>
              </button>
            ) : (
              <button type="button" className="tool-btn danger" onClick={() => setConfirm('leave')}>
                <Icon name="exit" /><small>Leave</small>
              </button>
            )}
          </div>
        </div>
        {sharing && list.isOwner && <SharePanel listId={listId} onChanged={refresh} />}
        {error && <p className="error">{error}</p>}
        {dialogs}
      </section>
    );
  }

  return (
    <div className={`split${selected ? ' has-detail' : ''}`}>
      <section className="page master">
        <div className="page-head">
          <h1>{list.name}</h1>
          <SortSelect value={sort} onChange={changeSort} />
          {canSettings && (
            <button type="button" className="icon-btn settings-btn" aria-label="List settings" title="List settings" onClick={() => show({ settings: '1', item: null })}>
              ⚙
            </button>
          )}
        </div>
        {!list.isOwner && <p className="muted small">Shared by {list.ownerName}</p>}

        <form className="add-form" onSubmit={add}>
          <input placeholder="Add an item…" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} aria-label="New item title" />
          <button type="submit" className="primary icon-submit" aria-label="Add item" title="Add item" disabled={adding || !title.trim()}>＋</button>
        </form>

        {error && <p className="error">{error}</p>}
        {loading && <p className="muted">Loading…</p>}
        {!loading && items && (
          <>
            {open.length === 0 && <p className="muted empty">Nothing to do here.</p>}
            <ul className="items">{open.map(row)}</ul>
            {done.length > 0 && (
              <details className="completed">
                <summary><Icon name="check" size={16} /> Completed ({done.length})</summary>
                <ul className="items">{done.map(row)}</ul>
              </details>
            )}
          </>
        )}
        {dialogs}
      </section>

      {selected && (
        <ItemDetail
          key={selected.itemId}
          item={selected}
          onChange={(u) => replace(u, selected)}
          onError={setError}
          onClose={() => show({ item: null })}
        />
      )}
    </div>
  );
}

function SharePanel({ listId, onChanged }: { listId: string; onChanged: () => Promise<void> }) {
  const { data: members, setData, error, setError } = useLoad(() => api.listMembers(listId), listId);
  const { data: users, reload: reloadUsers } = useLoad(() => api.listUsers(), listId);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  const candidates = (users ?? [])
    .filter((u) => u.enabled && !(members ?? []).some((m) => m.userId === u.userId))
    .sort((a, b) => compareText(a.displayName, b.displayName));

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

  /** Someone new: create them as a guest, then share the list with them. */
  async function inviteGuest(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await api.createUser(guestEmail, guestName, 'GUEST');
      setData(await api.shareList(listId, created.user.email));
      setIssued({ email: created.user.email, password: created.temporaryPassword });
      setGuestName('');
      setGuestEmail('');
      setError(null);
      await Promise.all([onChanged(), reloadUsers()]);
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
        <select value={email} onChange={(e) => setEmail(e.target.value)} required aria-label="User to share with">
          <option value="">Choose a user…</option>
          {candidates.map((u) => <option key={u.userId} value={u.email}>{u.displayName} ({u.email})</option>)}
        </select>
        <button type="submit" className="icon-submit" aria-label="Share" title="Share" disabled={busy || !email}><Icon name="people" /></button>
      </form>
      <form className="inline-form" onSubmit={inviteGuest}>
        <input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="New person: name" aria-label="New person's name" required maxLength={100} />
        <input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="Email" aria-label="New person's email" required />
        <button type="submit" className="icon-submit" aria-label="Add as guest and share" title="Add as guest and share" disabled={busy}><Icon name="plus" /></button>
      </form>
      {issued && (
        <div className="card notice" role="status">
          <p>Temporary password for <strong>{issued.email}</strong>. It is shown only once; they choose their own at first sign-in. If they lose it, an admin can reset it.</p>
          <p><code className="password">{issued.password}</code></p>
          <button type="button" aria-label="Done" title="Done" className="icon-btn" onClick={() => setIssued(null)}><Icon name="check" /></button>
        </div>
      )}
      <p className="muted small">Everyone on the list can add, complete and remove items. Only you can rename, share or delete it.</p>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/** The list's email address: off by default, switched on by its owner with a unique name. */
function MailSettings({ list, domain, onChanged }: { list: ListSummary; domain: string; onChanged: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function set(next: string | null) {
    setBusy(true);
    try {
      await api.setListMailName(list.listId, next);
      setName('');
      setError(null);
      await onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field">
      <span>Email address</span>
      {list.mailName ? (
        <div className="due-row">
          <Icon name="mail" size={18} />
          <code className="mail-address">{list.mailName}@{domain}</code>
          <button type="button" className="icon-btn" aria-label="Turn off email for this list" title="Turn off email for this list" disabled={busy} onClick={() => set(null)}>
            <Icon name="close" />
          </button>
        </div>
      ) : (
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); void set(name); }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="name" aria-label="Address name" maxLength={32} required />
          <span className="mail-domain">@{domain}</span>
          <button type="submit" className="icon-submit" aria-label="Turn on email for this list" title="Turn on email for this list" disabled={busy || !name.trim()}>
            <Icon name="check" />
          </button>
        </form>
      )}
      <small className="muted">Mail from members of this list to this address is added as an item.</small>
      {error && <small className="error">{error}</small>}
    </div>
  );
}
