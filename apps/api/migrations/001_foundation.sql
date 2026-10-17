CREATE SCHEMA IF NOT EXISTS app;
CREATE TABLE app.users (
  id uuid PRIMARY KEY,
  clerk_user_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.challenge_versions (
  slug text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  manifest jsonb NOT NULL,
  manifest_sha256 text NOT NULL,
  PRIMARY KEY (slug, version)
);
CREATE TABLE app.attempts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app.users(id),
  challenge_slug text NOT NULL,
  challenge_version integer NOT NULL,
  client_request_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','queued','running','evaluated','execution_error')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  artifact jsonb NOT NULL,
  artifact_sha256 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  evaluation_id uuid,
  evidence_id uuid,
  UNIQUE (user_id, client_request_id),
  FOREIGN KEY (challenge_slug, challenge_version) REFERENCES app.challenge_versions(slug, version)
);
CREATE INDEX attempts_owner_history ON app.attempts(user_id, created_at DESC, id DESC);
CREATE FUNCTION app.reject_immutable_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'immutable record'; END;
$$;
CREATE TRIGGER immutable_challenge BEFORE UPDATE OR DELETE ON app.challenge_versions
FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_change();
CREATE FUNCTION app.protect_frozen_artifact() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'draft' AND
    (NEW.artifact IS DISTINCT FROM OLD.artifact OR NEW.revision <> OLD.revision
     OR NEW.artifact_sha256 IS DISTINCT FROM OLD.artifact_sha256
     OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
     OR NEW.user_id <> OLD.user_id OR NEW.challenge_slug <> OLD.challenge_slug
     OR NEW.challenge_version <> OLD.challenge_version) THEN
    RAISE EXCEPTION 'submitted artifact is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER frozen_artifact BEFORE UPDATE ON app.attempts
FOR EACH ROW EXECUTE FUNCTION app.protect_frozen_artifact();
