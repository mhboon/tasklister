import { useState } from 'react';
import { changePassword } from '../lib/auth';
import { useAuth } from '../lib/useAuth';
import { useAppData } from '../lib/AppData';

export function AccountPage() {
  const { user } = useAuth();
  const { mailDomain } = useAppData();
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await changePassword(oldPw, newPw);
      setOldPw('');
      setNewPw('');
      setMsg({ ok: true, text: 'Password changed.' });
    } catch (err) {
      const e = err as Error;
      setMsg({ ok: false, text: e.name === 'NotAuthorizedException' ? 'Current password is wrong.' : e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page narrow">
      <h1>Account</h1>
      <p>Signed in as <strong>{user?.email}</strong>{user ? ` (${user.role.toLowerCase()})` : ''}.</p>
      {mailDomain && user?.canWork && (
        <p className="muted small">
          Email an item to your Inbox: <code className="mail-address">me@{mailDomain}</code>, from <strong>{user.email}</strong>.
        </p>
      )}
      <form className="card" onSubmit={submit}>
        <h2>Change password</h2>
        <label className="field"><span>Current password</span>
          <input type="password" autoComplete="current-password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} required />
        </label>
        <label className="field"><span>New password</span>
          <input type="password" autoComplete="new-password" minLength={8} value={newPw} onChange={(e) => setNewPw(e.target.value)} required />
        </label>
        {msg && <p className={msg.ok ? 'ok' : 'error'}>{msg.text}</p>}
        <button type="submit" className="primary" disabled={busy}>Change password</button>
      </form>
    </section>
  );
}
