import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { login, toAuthenticatedUser } from '../lib/auth';
import { useAuth } from '../lib/useAuth';

type Step = { kind: 'credentials' } | { kind: 'new-password'; complete: (pw: string) => Promise<import('amazon-cognito-identity-js').CognitoUserSession> };

export function LoginPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  // Where the user was heading (e.g. a shared link) before being asked to sign in.
  const from = (useLocation().state as { from?: string } | null)?.from;
  const dest = from && from.startsWith('/') && !from.startsWith('//') ? from : '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [step, setStep] = useState<Step>({ kind: 'credentials' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={dest} replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (step.kind === 'credentials') {
        const result = await login(email, password);
        if (result.type === 'success') {
          setUser(toAuthenticatedUser(result.session));
          navigate(dest, { replace: true });
        } else {
          setStep({ kind: 'new-password', complete: result.completeNewPassword });
        }
      } else {
        const session = await step.complete(newPassword);
        setUser(toAuthenticatedUser(session));
        navigate(dest, { replace: true });
      }
    } catch (err) {
      setError(friendly(err as Error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <h1>Tasklister</h1>
        {step.kind === 'credentials' ? (
          <>
            <label className="field">
              <span>Email</span>
              <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </label>
            <label className="field">
              <span>Password</span>
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
          </>
        ) : (
          <>
            <p>Choose your own password to finish signing in.</p>
            <label className="field">
              <span>New password</span>
              <input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required autoFocus />
            </label>
            <p className="muted small">At least 8 characters, with upper and lower case, a number and a symbol.</p>
          </>
        )}
        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary" disabled={busy}>{busy ? 'Signing in…' : step.kind === 'credentials' ? 'Sign in' : 'Set password'}</button>
        {step.kind === 'credentials' && <p className="muted small">Access is by invitation. Ask an admin for an account.</p>}
      </form>
    </div>
  );
}

function friendly(err: Error): string {
  if (err.name === 'NotAuthorizedException') return 'Wrong email or password.';
  if (err.name === 'InvalidPasswordException') return err.message;
  return err.message || 'Sign-in failed.';
}
