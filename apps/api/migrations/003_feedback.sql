CREATE TABLE app.ai_annotations (
  id uuid PRIMARY KEY,
  evidence_id uuid NOT NULL REFERENCES app.evidence(id),
  feature text NOT NULL,
  prompt_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('generating','ready','unavailable')),
  source text CHECK (source IN ('llm','rules')),
  provider text,
  model text,
  output jsonb,
  usage jsonb,
  failure_code text,
  claim_token uuid,
  deadline_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evidence_id,feature,prompt_version),
  CHECK ((status='generating') = (claim_token IS NOT NULL)),
  CHECK ((status='generating') = (output IS NULL))
);
CREATE INDEX annotation_deadlines ON app.ai_annotations(deadline_at) WHERE status='generating';
