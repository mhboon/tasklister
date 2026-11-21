import { useEffect, useState } from 'react';
import { changePassword } from '../lib/auth';
import { useAuth } from '../lib/useAuth';
import { api, type SenderAddress } from '../lib/api';
import { useAppData } from '../lib/AppData';
import { useLoad } from '../lib/useLoad';
import { Icon } from '../components/Icon';

export function AccountPage() {
  const { user } = useAuth();
  const { mailDomain } = useAppData();
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const senders = useLoad(() => (mailDomain ? api.listSenderAddresses() : Promise.resolve([] as SenderAddress[])), mailDomain ?? '');
  const [newSender, setNewSender] = useState('');
  const hasPending = (senders.data ?? []).some((s) => s.status === 'PENDING');
  const reloadSenders = senders.reload;
  // While a code is waiting for its mail, look every few seconds so the address turns verified on its own.
  useEffect(() => {
    if (!hasPending) return;
    const t = setInterval(() => void reloadSenders(), 8000);
    return () => clearInterval(t);
  }, [hasPending, reloadSenders]);

  async function addSender(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.addSenderAddress(newSender);
      setNewSender('');
      senders.setError(null);
      await reloadSenders();
    } catch (err) {
      senders.setError((err as Error).message);
    }
  }

  async function removeSender(email: string) {
    try {
      await api.removeSenderAddress(email);
      await reloadSenders();
    } catch (err) {
      senders.setError((err as Error).message);
    }
  }

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
      {mailDomain && (
        <div className="card">
          <h2>Other sender addresses</h2>
          <p className="muted small">Mail from these addresses is treated as yours, for example your work email.</p>
          <ul className="sender-list">
            {(senders.data ?? []).map((s) => (
              <li key={s.email}>
                <span className="sender-info">
                  <Icon name={s.status === 'VERIFIED' ? 'check' : 'clock'} size={16} /> <strong>{s.email}</strong>
                  {s.status === 'PENDING' && (
                    <small className="muted">
                      {' '}Send a mail from this address to <code className="mail-address">me@{mailDomain}</code> with the subject{' '}
                      <code className="mail-address">{s.code}</code>. The code works for 24 hours.
                    </small>
                  )}
                  {s.status === 'EXPIRED' && <small className="muted"> The code expired.</small>}
                </span>
                {s.status === 'EXPIRED' && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`New code for ${s.email}`}
                    title="New code"
                    onClick={() => void api.addSenderAddress(s.email).then(reloadSenders).catch((err: Error) => senders.setError(err.message))}
                  >
                    <Icon name="refresh" />
                  </button>
                )}
                <button type="button" className="icon-btn" aria-label={`Remove ${s.email}`} title="Remove" onClick={() => void removeSender(s.email)}>
                  <Icon name="close" />
                </button>
              </li>
            ))}
          </ul>
          <form className="inline-form" onSubmit={addSender}>
            <input type="email" value={newSender} onChange={(e) => setNewSender(e.target.value)} placeholder="Another email address" aria-label="Another email address" required />
            <button type="submit" className="icon-submit" aria-label="Add sender address" title="Add sender address"><Icon name="plus" /></button>
          </form>
          {senders.error && <p className="error">{senders.error}</p>}
        </div>
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
