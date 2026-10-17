CREATE TABLE app.evaluations (
  id uuid PRIMARY KEY,
  attempt_id uuid NOT NULL UNIQUE REFERENCES app.attempts(id),
  status text NOT NULL CHECK (status IN ('queued','running','completed','error')),
  generation integer NOT NULL DEFAULT 1 CHECK (generation > 0),
  execution_count integer NOT NULL DEFAULT 0 CHECK (execution_count BETWEEN 0 AND 2),
  queued_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  lease_expires_at timestamptz,
  run_id uuid,
  deterministic_result jsonb,
  execution_error jsonb,
  evidence_id uuid,
  CHECK ((status='completed') = (deterministic_result IS NOT NULL)),
  CHECK ((status='error') = (execution_error IS NOT NULL))
);
CREATE INDEX evaluation_queue ON app.evaluations(queued_at,id) WHERE status='queued';
CREATE INDEX evaluation_leases ON app.evaluations(lease_expires_at) WHERE status='running';
CREATE TABLE app.evidence (
  id uuid PRIMARY KEY,
  evaluation_id uuid NOT NULL UNIQUE REFERENCES app.evaluations(id),
  snapshot jsonb NOT NULL,
  snapshot_sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app.attempts ADD CONSTRAINT attempt_evaluation_fk FOREIGN KEY (evaluation_id) REFERENCES app.evaluations(id);
ALTER TABLE app.attempts ADD CONSTRAINT attempt_evidence_fk FOREIGN KEY (evidence_id) REFERENCES app.evidence(id);
ALTER TABLE app.evaluations ADD CONSTRAINT evaluation_evidence_fk FOREIGN KEY (evidence_id) REFERENCES app.evidence(id);
CREATE TRIGGER immutable_evidence BEFORE UPDATE OR DELETE ON app.evidence
FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_change();
CREATE FUNCTION app.protect_completed_evaluation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status='completed' THEN RAISE EXCEPTION 'completed evaluation is immutable'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER completed_evaluation BEFORE UPDATE OR DELETE ON app.evaluations
FOR EACH ROW EXECUTE FUNCTION app.protect_completed_evaluation();

CREATE SCHEMA IF NOT EXISTS challenge_eval;
CREATE TABLE challenge_eval.accounts (
  run_id uuid NOT NULL,
  scenario text NOT NULL,
  account_id text NOT NULL,
  balance_minor bigint NOT NULL DEFAULT 0 CHECK (balance_minor BETWEEN 0 AND 1000000000),
  PRIMARY KEY (run_id,scenario,account_id)
);
CREATE TABLE challenge_eval.operations (
  run_id uuid NOT NULL,
  scenario text NOT NULL,
  account_id text NOT NULL,
  key text NOT NULL,
  operation_id uuid NOT NULL,
  payload_hash text NOT NULL,
  response jsonb,
  PRIMARY KEY (run_id,scenario,account_id,key),
  UNIQUE (run_id,scenario,account_id,operation_id),
  FOREIGN KEY (run_id,scenario,account_id) REFERENCES challenge_eval.accounts(run_id,scenario,account_id)
);
CREATE TABLE challenge_eval.ledger (
  run_id uuid NOT NULL,
  scenario text NOT NULL,
  account_id text NOT NULL,
  operation_id uuid NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 1 AND 1000000),
  PRIMARY KEY (run_id,scenario,account_id,operation_id),
  FOREIGN KEY (run_id,scenario,account_id,operation_id) REFERENCES challenge_eval.operations(run_id,scenario,account_id,operation_id)
);
