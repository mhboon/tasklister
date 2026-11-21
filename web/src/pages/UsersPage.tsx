import { useState } from 'react';
import { compareText } from '../lib/sort';
import { api, type User } from '../lib/api';
import { useAppData } from '../lib/AppData';
import { useLoad } from '../lib/useLoad';

interface Issued { email: string; password: string }

export function UsersPage() {
  const { me } = useAppData();
  const { data: users, error, setError, loading, reload } = useLoad(() => api.listUsers());
  // A user's id, 'new' for the create form, or null for neither. The detail
  // is beside the list on a wide screen and a screen of its own on a phone.
  const [openId, setOpenId] = useState<string | 'new' | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [admin, setAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);

  const selected = (users ?? []).find((u) => u.userId === openId) ?? null;
  const showDetail = openId === 'new' || selected !== null;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.createUser(email, name, admin);
      setIssued({ email: r.user.email, password: r.temporaryPassword });
      setEmail('');
      setName('');
      setAdmin(false);
      setOpenId(null);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<void>) {
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const reset = (u: User) =>
    act(async () => {
      const r = await api.resetUserPassword(u.userId);
      setIssued({ email: u.email, password: r.temporaryPassword });
    });
  const setAdminRole = (u: User) =>
    act(async () => {
      await api.setUserAdmin(u.userId, !u.isAdmin);
      await reload();
    });
  const toggle = (u: User) =>
    act(async () => {
      await api.setUserEnabled(u.userId, !u.enabled);
      await reload();
    });

  return (
    <div className={`split${showDetail ? ' has-detail' : ''}`}>
      <section className="page master">
        <div className="page-head">
          <h1>Users</h1>
          <button type="button" className="primary" onClick={() => setOpenId('new')}>New user</button>
        </div>
        <p className="muted small">Only people listed here can sign in. Nothing is emailed: pass the temporary password on yourself.</p>

        {issued && (
          <div className="card notice" role="status">
            <p>Temporary password for <strong>{issued.email}</strong>. It is shown only once; they must choose their own at first sign-in.</p>
            <p><code className="password">{issued.password}</code></p>
            <button type="button" onClick={() => setIssued(null)}>Done</button>
          </div>
        )}

        {error && <p className="error">{error}</p>}
        {loading && <p className="muted">Loading…</p>}
        <ul className="items">
          {[...(users ?? [])].sort((a, b) => compareText(a.displayName, b.displayName)).map((u) => (
            <li key={u.userId} className={`item${u.enabled ? '' : ' done'}${u.userId === openId ? ' selected' : ''}`}>
              <div className="item-main">
                <div className="item-title" onClick={() => setOpenId(u.userId)}>
                  <div className="grow">
                    <div className="title-text">{u.displayName}<span className="badge"> {u.isAdmin ? 'admin' : 'guest'}</span>{!u.enabled && <span className="badge"> disabled</span>}</div>
                    <div className="muted small">{u.email}</div>
                  </div>
                </div>
                <button type="button" className="icon-btn expand-btn" aria-label={`Open ${u.displayName}`} onClick={() => setOpenId(u.userId)}>›</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {showDetail && (
        <aside className="detail-pane" aria-label="User details">
          <div className="detail-head">
            <button type="button" className="back-btn" onClick={() => setOpenId(null)}>← Back</button>
          </div>
          {openId === 'new' ? (
            <form className="card" onSubmit={create}>
              <h2>Authorize a new user</h2>
              <label className="field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} /></label>
              <label className="field"><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
              <label className="check"><input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} /> Admin (otherwise a guest: can only work on items in lists shared with them)</label>
              <button type="submit" className="primary" disabled={busy}>Create user</button>
            </form>
          ) : (
            selected && (
              <div className="card">
                <h2>{selected.displayName}</h2>
                <p className="muted small">{selected.email} · {selected.isAdmin ? 'admin' : 'guest'}{!selected.enabled ? ' · disabled' : ''}</p>
                <div className="user-actions">
                  <button type="button" onClick={() => setAdminRole(selected)}>{selected.isAdmin ? 'Make guest' : 'Make admin'}</button>
                  {/* Admins are peers: you can't lock out or take over another admin. */}
                  {(!selected.isAdmin || selected.userId === me?.userId) && (
                    <>
                      <button type="button" onClick={() => reset(selected)}>Reset password</button>
                      {selected.userId !== me?.userId && (
                        <button type="button" className={selected.enabled ? 'danger' : ''} onClick={() => toggle(selected)}>
                          {selected.enabled ? 'Disable' : 'Enable'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          )}
        </aside>
      )}
    </div>
  );
}
