import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Branding from '../../components/Branding.jsx';
import { ErrorBanner, SuccessBanner } from '../../components/Feedback.jsx';
import PasswordInput from '../../components/PasswordInput.jsx';
import { messageFor } from '../../services/api.js';
import api from '../../services/api.js';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [token, setToken] = useState(() => new URLSearchParams(window.location.search).get('token') || '');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (window.location.search) navigate('/reset-password', { replace: true });
  }, [navigate]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/password-reset/confirm', { token, password });
      setSuccess(true);
      setToken('');
      setPassword('');
      setConfirmation('');
    } catch (requestError) {
      const message = messageFor(requestError);
      setError(message);
      if (/invalid or has expired/i.test(message)) setToken('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <aside className="auth-aside">
        <Branding />
        <div className="auth-story">
          <div className="eyebrow eyebrow-light">ACCOUNT RECOVERY</div>
          <h1>Choose a new <em>password.</em></h1>
          <p>Use a new password to restore access to the same account and role.</p>
          <div className="story-rule" />
          <div className="story-location">Reset links expire after 30 minutes</div>
        </div>
        <div className="auth-aside-footer">Unified Campus Placement and Eligibility Intelligence System</div>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <div className="eyebrow">PASSWORD RECOVERY</div>
          <h2>Set a new password</h2>
          <p className="auth-subtitle">Choose a password with at least 10 characters.</p>
          <ErrorBanner>{error}</ErrorBanner>
          <SuccessBanner>{success ? 'Your password has been changed. Sign in with your new password.' : ''}</SuccessBanner>
          {!success && token && (
            <form onSubmit={submit} className="form-stack" aria-busy={busy}>
              <label>New password
                <PasswordInput
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={128}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 10 characters"
                  disabled={busy}
                />
              </label>
              <label>Confirm new password
                <PasswordInput
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={128}
                  required
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  placeholder="Re-enter your new password"
                  disabled={busy}
                />
              </label>
              <button className="button button-primary button-full" type="submit" disabled={busy}>
                {busy ? 'Changing password…' : 'Change password'}<span aria-hidden="true">→</span>
              </button>
            </form>
          )}
          {!success && !token && <p className="auth-subtitle">This reset link is missing, invalid, expired, or already used. Request a new link to continue.</p>}
          <p className="auth-switch"><Link to={success ? '/login' : '/forgot-password'}>{success ? 'Back to sign in' : 'Request another reset link'}</Link></p>
          {!success && <p className="auth-switch"><Link to="/login">Back to sign in</Link></p>}
        </div>
        <div className="auth-legal">Academic Project Prototype · Sahyadri College of Engineering &amp; Management</div>
      </main>
    </div>
  );
}
