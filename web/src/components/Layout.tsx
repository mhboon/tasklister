import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { useAppData } from '../lib/AppData';
import { compareText } from '../lib/sort';
import { api, type ListSummary } from '../lib/api';
import { ConfirmDialog } from './ConfirmDialog';
import { PromptDialog } from './PromptDialog';

type Prompt =
  | { kind: 'list'; folderId: string | null }
  | { kind: 'folder' }
  | { kind: 'rename-folder'; folderId: string; name: string };

export function Layout() {
  const { user, logout } = useAuth();
  const { lists, folders, refresh, error } = useAppData();
  const navigate = useNavigate();
  const isAdmin = !!user?.isAdmin;
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);

  const sortedFolders = [...folders].sort((a, b) => compareText(a.name, b.name));
  const inbox = lists.find((l) => l.isInbox);
  const others = lists.filter((l) => !l.isInbox);
  const rootLists = others.filter((l) => !l.folderId || !folders.some((f) => f.folderId === l.folderId));
  const close = () => setMenuOpen(false);

  const listLink = (l: ListSummary) => (
    <li key={l.listId}>
      <NavLink to={`/lists/${l.listId}`} onClick={close} className={({ isActive }) => (isActive ? 'active' : '')}>
        <span className="nav-name">{l.name}</span>
        {!l.isOwner && <span className="nav-note" title={`Shared by ${l.ownerName}`}>shared</span>}
        {l.openCount > 0 && <span className="nav-count" title="Open items">{l.openCount}</span>}
      </NavLink>
    </li>
  );

  async function submitPrompt(value: string) {
    if (!prompt) return;
    if (prompt.kind === 'list') {
      const created = await api.createList(value, prompt.folderId);
      await refresh();
      setPrompt(null);
      close();
      navigate(`/lists/${created.listId}`);
    } else if (prompt.kind === 'folder') {
      await api.createFolder(value);
      await refresh();
      setPrompt(null);
    } else {
      await api.renameFolder(prompt.folderId, value);
      await refresh();
      setPrompt(null);
    }
  }

  const toggle = (id: string) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="shell">
      <header className="topbar">
        <button type="button" className="icon-btn menu-btn" aria-label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
          ☰
        </button>
        <span className="brand">Tasklister</span>
      </header>

      {menuOpen && <div className="scrim" onClick={close} />}
      <nav className={`sidebar${menuOpen ? ' open' : ''}`} aria-label="Main">
        <div className="brand desktop-only">Tasklister</div>

        <ul className="nav-list">
          {inbox && listLink(inbox)}
          <li><NavLink to="/agenda" onClick={close}>Agenda</NavLink></li>
          <li><NavLink to="/priority" onClick={close}>Priority</NavLink></li>
          {isAdmin && <li><NavLink to="/recurring" onClick={close}>Recurring</NavLink></li>}
        </ul>

        <div className="nav-section">
          <h2>Lists</h2>
          <span className="spacer" />
          {isAdmin && (
            <>
              <button type="button" className="icon-btn" aria-label="New folder" title="New folder" onClick={() => setPrompt({ kind: 'folder' })}>
                🗀
              </button>
              <button type="button" className="icon-btn" aria-label="New list" title="New list" onClick={() => setPrompt({ kind: 'list', folderId: null })}>
                ＋
              </button>
            </>
          )}
        </div>

        <ul className="nav-list">
          {rootLists.map(listLink)}
          {sortedFolders.map((f) => {
            const inFolder = others.filter((l) => l.folderId === f.folderId);
            const isCollapsed = collapsed.has(f.folderId);
            return (
              <li key={f.folderId} className="folder">
                <div className="folder-head">
                  <button type="button" className="folder-toggle" aria-expanded={!isCollapsed} onClick={() => toggle(f.folderId)}>
                    <span aria-hidden>{isCollapsed ? '▸' : '▾'}</span> {f.name}
                  </button>
                  {isAdmin && <>
                  <button type="button" className="icon-btn small" aria-label={`New list in ${f.name}`} title="New list here" onClick={() => setPrompt({ kind: 'list', folderId: f.folderId })}>＋</button>
                  <button type="button" className="icon-btn small" aria-label={`Rename folder ${f.name}`} title="Rename folder" onClick={() => setPrompt({ kind: 'rename-folder', folderId: f.folderId, name: f.name })}>✎</button>
                  <button type="button" className="icon-btn small" aria-label={`Delete folder ${f.name}`} title="Delete folder" onClick={() => setDeleteFolderId(f.folderId)}>✕</button>
                  </>}
                </div>
                {!isCollapsed && (
                  <ul className="nav-list nested">
                    {inFolder.length === 0 ? <li className="muted empty-note">Empty</li> : inFolder.map(listLink)}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>

        <ul className="nav-list nav-footer">
          {user?.isAdmin && <li><NavLink to="/users" onClick={close}>Users</NavLink></li>}
          <li><NavLink to="/account" onClick={close}>Account</NavLink></li>
          <li><button type="button" className="link-btn" onClick={logout}>Sign out</button></li>
        </ul>
      </nav>

      <main className="content">
        {error && <p className="error banner">{error}</p>}
        <Outlet />
      </main>

      <PromptDialog
        open={prompt !== null}
        title={prompt?.kind === 'list' ? 'New list' : prompt?.kind === 'folder' ? 'New folder' : 'Rename folder'}
        label="Name"
        initial={prompt?.kind === 'rename-folder' ? prompt.name : ''}
        confirmLabel={prompt?.kind === 'rename-folder' ? 'Rename' : 'Create'}
        onSubmit={submitPrompt}
        onCancel={() => setPrompt(null)}
      />
      <ConfirmDialog
        open={deleteFolderId !== null}
        title="Delete this folder?"
        message="The lists inside are not deleted; they move to the top level."
        confirmLabel="Delete folder"
        danger
        onCancel={() => setDeleteFolderId(null)}
        onConfirm={async () => {
          if (!deleteFolderId) return;
          await api.deleteFolder(deleteFolderId);
          setDeleteFolderId(null);
          await refresh();
        }}
      />
    </div>
  );
}
