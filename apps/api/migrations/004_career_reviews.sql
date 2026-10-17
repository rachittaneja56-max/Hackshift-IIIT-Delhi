CREATE TABLE app.career_reviews (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app.users(id),
  client_request_id uuid NOT NULL,
  request_fingerprint text NOT NULL CHECK (length(request_fingerprint) = 64),
  input jsonb NOT NULL,
  analysis_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('generating','ready','limited','unavailable')),
  source text CHECK (source IN ('llm','rules')),
  provider text,
  model text,
  analysis jsonb,
  failure_code text,
  claim_token uuid,
  deadline_at timestamptz,
  resume_draft jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_request_id),
  CHECK ((status = 'generating') = (claim_token IS NOT NULL)),
  CHECK ((status IN ('ready','limited')) = (analysis IS NOT NULL)),
  CHECK ((status = 'ready' AND source = 'llm') OR
         (status = 'limited' AND source = 'rules') OR
         (status IN ('generating','unavailable') AND source IS NULL))
);

CREATE INDEX career_reviews_owner_history ON app.career_reviews(user_id, created_at DESC, id DESC);
CREATE INDEX career_reviews_generation_deadline ON app.career_reviews(deadline_at) WHERE status = 'generating';

CREATE TABLE app.career_review_evidence (
  review_id uuid NOT NULL REFERENCES app.career_reviews(id),
  evidence_id uuid NOT NULL REFERENCES app.evidence(id),
  position smallint NOT NULL CHECK (position BETWEEN 0 AND 9),
  PRIMARY KEY (review_id, evidence_id),
  UNIQUE (review_id, position)
);

CREATE FUNCTION app.protect_career_review_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.client_request_id IS DISTINCT FROM OLD.client_request_id
     OR NEW.request_fingerprint IS DISTINCT FROM OLD.request_fingerprint
     OR NEW.input IS DISTINCT FROM OLD.input
     OR NEW.analysis_version IS DISTINCT FROM OLD.analysis_version THEN
    RAISE EXCEPTION 'career review source is immutable';
  END IF;
  IF OLD.analysis IS NOT NULL AND NEW.analysis IS DISTINCT FROM OLD.analysis THEN
    RAISE EXCEPTION 'career review analysis is immutable';
  END IF;
  IF OLD.resume_draft IS NOT NULL AND NEW.resume_draft IS DISTINCT FROM OLD.resume_draft THEN
    RAISE EXCEPTION 'career review resume draft is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_career_review_source BEFORE UPDATE ON app.career_reviews
FOR EACH ROW EXECUTE FUNCTION app.protect_career_review_source();

CREATE FUNCTION app.reject_career_review_evidence_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'career review evidence selection is immutable'; END;
$$;
CREATE TRIGGER immutable_career_review_evidence BEFORE UPDATE OR DELETE ON app.career_review_evidence
FOR EACH ROW EXECUTE FUNCTION app.reject_career_review_evidence_change();
