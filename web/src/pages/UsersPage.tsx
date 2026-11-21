import { useState } from 'react';
import { compareText } from '../lib/sort';
import { api, type User } from '../lib/api';
import { useAppData } from '../lib/AppData';
import { useLoad } from '../lib/useLoad';

interface Issued { email: string; password: string }

export function UsersPage() {
  const { me } = useAppData();
  const { data: users, error, setError, loading, reload } = useLoad(() => api.listUsers());
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [admin, setAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);

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
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function reset(u: User) {
    try {
      const r = await api.resetUserPassword(u.userId);
      setIssued({ email: u.email, password: r.temporaryPassword });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function setAdminRole(u: User) {
    try {
      await api.setUserAdmin(u.userId, !u.isAdmin);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function toggle(u: User) {
    try {
      await api.setUserEnabled(u.userId, !u.enabled);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className="page">
      <h1>Users</h1>
      <p className="muted small">Only people listed here can sign in. Nothing is emailed: pass the temporary password on yourself.</p>

      {issued && (
        <div className="card notice" role="status">
          <p>Temporary password for <strong>{issued.email}</strong>. It is shown only once; they must choose their own at first sign-in.</p>
          <p><code className="password">{issued.password}</code></p>
          <button type="button" onClick={() => setIssued(null)}>Done</button>
        </div>
      )}

      <form className="card" onSubmit={create}>
        <h2>Authorize a new user</h2>
        <div className="row">
          <label className="field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} /></label>
          <label className="field"><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        </div>
        <label className="check"><input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} /> Admin (otherwise a guest: can only work on items in lists shared with them)</label>
        <button type="submit" className="primary" disabled={busy}>Create user</button>
      </form>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading…</p>}
      <ul className="items">
        {[...(users ?? [])].sort((a, b) => compareText(a.displayName, b.displayName)).map((u) => (
          <li key={u.userId} className={`item${u.enabled ? '' : ' done'}`}>
            <div className="item-main recurring-row">
              <div className="grow">
                <div className="title-text">{u.displayName}<span className="badge"> {u.isAdmin ? 'admin' : 'guest'}</span>{!u.enabled && <span className="badge"> disabled</span>}</div>
                <div className="muted small">{u.email}</div>
              </div>
              <div className="user-actions">
                <button type="button" onClick={() => setAdminRole(u)}>{u.isAdmin ? 'Make guest' : 'Make admin'}</button>
                {/* Admins are peers: you can't lock out or take over another admin. */}
                {(!u.isAdmin || u.userId === me?.userId) && (
                  <>
                    <button type="button" onClick={() => reset(u)}>Reset password</button>
                    <button type="button" className={u.enabled ? 'danger' : ''} onClick={() => toggle(u)}>{u.enabled ? 'Disable' : 'Enable'}</button>
                  </>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
