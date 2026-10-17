ALTER TABLE app.sandbox_sessions
  DROP CONSTRAINT sandbox_sessions_challenge_version_check;
ALTER TABLE app.sandbox_sessions
  ADD CONSTRAINT sandbox_sessions_challenge_version_check CHECK (challenge_version IN (1, 2));
ALTER TABLE app.sandbox_sessions
  ADD COLUMN source_revision bigint NOT NULL DEFAULT 0 CHECK (source_revision >= 0);

UPDATE app.sandbox_sessions
SET status='error',failure_code='CHALLENGE_VERSION_RETIRED',updated_at=now()
WHERE challenge_version=1 AND status IN ('creating','ready','processing','freezing','grading');

ALTER TABLE app.sandbox_test_runs
  ADD COLUMN challenge_version integer NOT NULL DEFAULT 1 CHECK (challenge_version IN (1, 2)),
  ADD COLUMN suite_sha256 text CHECK (suite_sha256 IS NULL OR length(suite_sha256) = 64),
  ADD COLUMN implementation_sha256 text CHECK (implementation_sha256 IS NULL OR length(implementation_sha256) = 64),
  ADD COLUMN source_revision bigint CHECK (source_revision IS NULL OR source_revision >= 0);

CREATE TABLE app.sandbox_jobs (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES app.sandbox_sessions(id),
  kind text NOT NULL CHECK (kind IN ('create','turn','visible','grade')),
  request_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL CHECK (status IN ('queued','running','completed','failed')),
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  claim_token uuid,
  lease_until timestamptz,
  available_at timestamptz NOT NULL DEFAULT now(),
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (session_id, kind, request_id),
  CHECK ((status = 'running') = (claim_token IS NOT NULL AND lease_until IS NOT NULL)),
  CHECK ((status IN ('completed','failed')) = (completed_at IS NOT NULL))
);
CREATE INDEX sandbox_jobs_claimable ON app.sandbox_jobs(status, available_at, created_at)
  WHERE status IN ('queued','running');
CREATE INDEX sandbox_jobs_session ON app.sandbox_jobs(session_id, created_at);
