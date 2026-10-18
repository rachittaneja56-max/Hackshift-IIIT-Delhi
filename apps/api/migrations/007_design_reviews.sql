CREATE TABLE app.design_reviews (
  id uuid PRIMARY KEY,
  evidence_id uuid NOT NULL REFERENCES app.evidence(id),
  artifact_sha256 text NOT NULL CHECK (artifact_sha256 ~ '^[a-f0-9]{64}$'),
  review_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('generating','ready','limited','unavailable')),
  source text CHECK (source IN ('llm','rules')),
  provider text,
  model text,
  output jsonb,
  failure_code text,
  claim_token uuid,
  deadline_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evidence_id,artifact_sha256,review_version),
  CHECK ((status='generating') = (claim_token IS NOT NULL AND deadline_at IS NOT NULL)),
  CHECK ((status IN ('ready','limited')) = (output IS NOT NULL)),
  CHECK ((status='ready' AND source='llm' AND provider IS NOT NULL AND model IS NOT NULL) OR
         (status='limited' AND source='rules') OR
         (status IN ('generating','unavailable') AND source IS NULL))
);

CREATE INDEX design_review_generation_deadline
  ON app.design_reviews(deadline_at) WHERE status='generating';

CREATE FUNCTION app.protect_design_review_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.evidence_id IS DISTINCT FROM OLD.evidence_id
     OR NEW.artifact_sha256 IS DISTINCT FROM OLD.artifact_sha256
     OR NEW.review_version IS DISTINCT FROM OLD.review_version
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'design review source is immutable';
  END IF;
  IF OLD.status='ready' THEN RAISE EXCEPTION 'completed design review is immutable'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_design_review_source BEFORE UPDATE ON app.design_reviews
FOR EACH ROW EXECUTE FUNCTION app.protect_design_review_source();
