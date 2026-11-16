import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { ErrorBanner } from '../../components/Feedback.jsx';
import Branding from '../../components/Branding.jsx';
import PasswordInput from '../../components/PasswordInput.jsx';
import { messageFor } from '../../services/api.js';

const roles = [
  {
    value: 'student',
    label: 'Student',
    heading: 'Welcome back, Student',
    helper: 'Sign in to review your profile, placement drives, and applications.',
    button: 'Sign in as Student',
    emailLabel: 'Student email address',
  },
  {
    value: 'placement_officer',
    label: 'Placement Officer / TPO',
    heading: 'Placement Cell sign in',
    helper: 'Use your Placement Cell account to manage students and campus drives.',
    button: 'Sign in to the Placement Cell',
    emailLabel: 'Placement Cell email address',
  },
  {
    value: 'recruiter',
    label: 'Recruiter',
    heading: 'Recruiter sign in',
    helper: 'Use your assigned recruiter account to review your company’s drives.',
    button: 'Sign in as Recruiter',
    emailLabel: 'Recruiter email address',
  },
];

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState('student');
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const selectedRole = roles.find((option) => option.value === role) || roles[0];

  if (user) return <Navigate to="/dashboard" replace />;

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login({ ...form, expectedRole: role });
      navigate('/dashboard', { replace: true });
    } catch (loginError) {
      setError(messageFor(loginError));
    } finally {
      setBusy(false);
    }
  }

  function changeRole(nextRole) {
    setRole(nextRole);
    setError('');
  }

  return (
    <div className="auth-screen">
      <aside className="auth-aside">
        <Branding />
        <div className="auth-story">
          <div className="eyebrow eyebrow-light">PLACEMENT INTELLIGENCE</div>
          <h1>Make every next step <em>count.</em></h1>
          <p>A shared workspace for students, recruiters and the Placement Cell to navigate campus opportunities with clarity.</p>
          <div className="story-rule" />
          <div className="story-location">Sahyadri Campus<br />Adyar · Mangaluru · Karnataka</div>
        </div>
        <div className="auth-aside-footer">Unified Campus Placement and Eligibility Intelligence System</div>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <div className="eyebrow">WELCOME BACK</div>
          <h2>{selectedRole.heading}</h2>
          <p className="auth-subtitle">{selectedRole.helper}</p>

          <ErrorBanner>{error}</ErrorBanner>

          <form onSubmit={submit} className="form-stack" aria-busy={busy}>
            <fieldset className="auth-role-fieldset">
              <legend>Choose your account type</legend>
              <div className="auth-role-options">
                {roles.map((option) => (
                  <label className={`auth-role-option${role === option.value ? ' selected' : ''}`} key={option.value}>
                    <input
                      type="radio"
                      name="login-role"
                      value={option.value}
                      checked={role === option.value}
                      onChange={() => changeRole(option.value)}
                      disabled={busy}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label>{selectedRole.emailLabel}
              <input
                type="email"
                autoComplete="username"
                required
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                placeholder="you@example.edu"
                disabled={busy}
              />
            </label>
            <label>Password
              <PasswordInput
                key={role}
                autoComplete="current-password"
                required
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                placeholder="Enter your password"
                disabled={busy}
              />
            </label>

            <button className="button button-primary button-full" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : selectedRole.button}<span aria-hidden="true">→</span>
            </button>
          </form>

          <p className="auth-switch"><Link to="/forgot-password">Forgot Password?</Link></p>

          {role === 'student' && (
            <p className="auth-switch">Student without an account? <Link to="/register">Create your account</Link></p>
          )}

          <div className="prototype-note">
            <span aria-hidden="true">i</span>
            <p>{role === 'student'
              ? 'Student registration matches your name, registration number, and imported roster email.'
              : 'Placement Officer and Recruiter access is managed by the Placement Cell. Public registration is not available for these roles.'}</p>
          </div>
        </div>
        <div className="auth-legal">Academic Project Prototype · Sahyadri College of Engineering &amp; Management</div>
      </main>
    </div>
  );
}
