import { useState } from 'react';
import './PasswordInput.css';

export default function PasswordInput({ autoComplete = 'current-password', ...inputProps }) {
  const [visible, setVisible] = useState(false);

  return (
    <span className="password-input">
      <input {...inputProps} type={visible ? 'text' : 'password'} autoComplete={autoComplete} />
      <button
        className="password-visibility-toggle"
        type="button"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? (
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M2.25 12s3.5-6.25 9.75-6.25c2.1 0 3.95.59 5.38 1.47M21.75 12s-3.5 6.25-9.75 6.25c-2.1 0-3.95-.59-5.38-1.47" />
            <path d="M9.88 9.88a3 3 0 0 0 4.24 4.24M3 3l18 18" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M2.25 12s3.5-6.25 9.75-6.25S21.75 12 21.75 12 18.25 18.25 12 18.25 2.25 12 2.25 12Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </span>
  );
}
