ALTER TABLE interview_rounds
  ADD COLUMN IF NOT EXISTS request_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_interview_round_request
  ON interview_rounds(application_id, request_id)
  WHERE request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS application_status_history (
  history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES applications(application_id) ON DELETE CASCADE,
  changed_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  previous_status TEXT NOT NULL CHECK (previous_status IN ('applied','under_review','shortlisted','rejected','interview','offered','withdrawn')),
  new_status TEXT NOT NULL CHECK (new_status IN ('applied','under_review','shortlisted','rejected','interview','offered','withdrawn')),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_application_status_history_application
  ON application_status_history(application_id, changed_at DESC);
