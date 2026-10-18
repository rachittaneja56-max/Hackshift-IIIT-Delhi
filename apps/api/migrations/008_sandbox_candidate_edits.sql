ALTER TABLE app.sandbox_jobs
  DROP CONSTRAINT sandbox_jobs_kind_check;

ALTER TABLE app.sandbox_jobs
  ADD CONSTRAINT sandbox_jobs_kind_check
  CHECK (kind IN ('create','turn','visible','grade','edit'));
