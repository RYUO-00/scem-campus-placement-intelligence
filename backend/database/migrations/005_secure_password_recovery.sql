ALTER TABLE users
  ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0
  CHECK (session_version >= 0);

-- Login already normalizes email case. Enforce the same uniqueness rule for
-- recovery so a case-variant duplicate can never make account selection ambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_case_insensitive
  ON users (lower(btrim(email)));

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  reset_token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  invalidated_at TIMESTAMPTZ,
  CHECK (expires_at > created_at),
  CHECK (used_at IS NULL OR invalidated_at IS NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_password_reset_one_active_per_user
  ON password_reset_tokens(user_id)
  WHERE used_at IS NULL AND invalidated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_password_reset_user_created
  ON password_reset_tokens(user_id, created_at DESC);
