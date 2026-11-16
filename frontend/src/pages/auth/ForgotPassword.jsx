import { useState } from 'react';
import { Link } from 'react-router-dom';
import Branding from '../../components/Branding.jsx';
import { ErrorBanner, SuccessBanner } from '../../components/Feedback.jsx';
import { messageFor } from '../../services/api.js';
import api from '../../services/api.js';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSubmitted(false);
    setBusy(true);
    try {
      await api.post('/auth/password-reset/request', { email });
      setSubmitted(true);
    } catch (requestError) {
      setError(messageFor(requestError));
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
          <h1>Get back to your <em>next step.</em></h1>
          <p>Request a time-limited password reset link for your campus placement account.</p>
          <div className="story-rule" />
          <div className="story-location">Student · Placement Cell · Recruiter</div>
        </div>
        <div className="auth-aside-footer">Unified Campus Placement and Eligibility Intelligence System</div>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <div className="eyebrow">PASSWORD RECOVERY</div>
          <h2>Forgot your password?</h2>
          <p className="auth-subtitle">Enter the email address on your account. For privacy, this page gives the same confirmation for every address.</p>
          <ErrorBanner>{error}</ErrorBanner>
          <SuccessBanner>{submitted ? 'If an account matches this email address, reset instructions may arrive shortly if email delivery is available. This confirmation does not verify delivery.' : ''}</SuccessBanner>
          {!submitted && (
            <form onSubmit={submit} className="form-stack" aria-busy={busy}>
              <label>Email address
                <input
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.edu"
                  disabled={busy}
                />
              </label>
              <button className="button button-primary button-full" type="submit" disabled={busy}>
                {busy ? 'Requesting reset…' : 'Send reset instructions'}<span aria-hidden="true">→</span>
              </button>
            </form>
          )}
          <p className="auth-switch"><Link to="/login">Back to sign in</Link></p>
          <div className="prototype-note"><span aria-hidden="true">i</span><p>Reset links expire after 30 minutes and can be used once. Development messages are captured in the configured Mailtrap Email Sandbox.</p></div>
        </div>
        <div className="auth-legal">Academic Project Prototype · Sahyadri College of Engineering &amp; Management</div>
      </main>
    </div>
  );
}
