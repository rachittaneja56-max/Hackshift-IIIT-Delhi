CREATE TABLE app.sandbox_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app.users(id),
  client_request_id uuid NOT NULL,
  challenge_slug text NOT NULL DEFAULT 'rate-limiter-debugging' CHECK (challenge_slug = 'rate-limiter-debugging'),
  challenge_version integer NOT NULL DEFAULT 1 CHECK (challenge_version = 1),
  status text NOT NULL CHECK (status IN ('creating','ready','processing','freezing','grading','submitted','expired','error')),
  sandbox_id text,
  starter_source text NOT NULL,
  current_source text NOT NULL,
  current_sha256 text NOT NULL CHECK (length(current_sha256) = 64),
  prompt_count smallint NOT NULL DEFAULT 0 CHECK (prompt_count BETWEEN 0 AND 5),
  visible_run_count smallint NOT NULL DEFAULT 0 CHECK (visible_run_count BETWEEN 0 AND 10),
  submit_request_id uuid,
  submitted_source text,
  submitted_sha256 text CHECK (submitted_sha256 IS NULL OR length(submitted_sha256) = 64),
  report jsonb,
  failure_code text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_request_id),
  UNIQUE (sandbox_id),
  CHECK (status NOT IN ('grading','submitted') OR submitted_source IS NOT NULL),
  CHECK ((status = 'submitted') = (report IS NOT NULL))
);

CREATE UNIQUE INDEX sandbox_one_active_per_user ON app.sandbox_sessions(user_id)
  WHERE status IN ('creating','ready','processing','freezing','grading');
CREATE INDEX sandbox_sessions_cleanup ON app.sandbox_sessions(expires_at)
  WHERE status IN ('creating','ready','processing','freezing','grading','error');

CREATE TABLE app.sandbox_turns (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES app.sandbox_sessions(id),
  client_request_id uuid NOT NULL,
  prompt_fingerprint text NOT NULL CHECK (length(prompt_fingerprint) = 64),
  ordinal smallint NOT NULL CHECK (ordinal BETWEEN 1 AND 5),
  prompt text NOT NULL CHECK (length(prompt) BETWEEN 1 AND 4000),
  status text NOT NULL CHECK (status IN ('processing','completed','error')),
  model text NOT NULL,
  response text,
  tool_events jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_sha256 text,
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, client_request_id),
  UNIQUE (session_id, ordinal)
);
CREATE INDEX sandbox_turns_session_order ON app.sandbox_turns(session_id, ordinal);

CREATE TABLE app.sandbox_test_runs (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES app.sandbox_sessions(id),
  client_request_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('visible','hidden')),
  status text NOT NULL CHECK (status IN ('running','completed','infrastructure_error','timeout')),
  source_sha256 text NOT NULL CHECK (length(source_sha256) = 64),
  observation jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (session_id, client_request_id)
);
CREATE INDEX sandbox_test_runs_session_order ON app.sandbox_test_runs(session_id, created_at DESC);

CREATE FUNCTION app.protect_sandbox_submission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.submitted_source IS NOT NULL AND (NEW.submitted_source IS DISTINCT FROM OLD.submitted_source
      OR NEW.submitted_sha256 IS DISTINCT FROM OLD.submitted_sha256
      OR NEW.submit_request_id IS DISTINCT FROM OLD.submit_request_id) THEN
    RAISE EXCEPTION 'sandbox submission is immutable';
  END IF;
  IF OLD.report IS NOT NULL AND NEW.report IS DISTINCT FROM OLD.report THEN
    RAISE EXCEPTION 'sandbox report is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_sandbox_submission BEFORE UPDATE ON app.sandbox_sessions
FOR EACH ROW EXECUTE FUNCTION app.protect_sandbox_submission();
