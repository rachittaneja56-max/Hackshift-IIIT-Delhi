import { useMemo } from 'react';
import { useApi, useResource } from '../app/context';
import { Link } from '../app/router';
import { ErrorNotice, PageTitle } from '../components/ui';
import { sandboxApi } from '../code-lab/api';

export function PracticeHome() {
  const { api, userId } = useApi();
  const sandbox = useMemo(() => sandboxApi(api), [api]);
  const availability = useResource(() => sandbox.availability(), `${userId}:sandbox-availability`);
  const sandboxReady = availability.data?.available === true;

  return <main id="main-content" tabIndex={-1} className="page practice-home">
    <PageTitle eyebrow="Practice / Engineering challenges" title="Choose a system to investigate.">
      <p className="lead">Work through two real exercises: reason about retry-safe database writes, or repair a rate limiter with a constrained coding assistant.</p>
    </PageTitle>
    <section className="practice-grid" aria-label="Available engineering challenges">
      <article className="practice-card architecture-practice">
        <div className="practice-card-top"><span className="eyebrow">Architecture &amp; Reliability Lab</span><span className="practice-state">Available</span></div>
        <h2>Make a retry safe.</h2>
        <p>Trace a lost response through an API and database. Draw HLD and LLD, inspect reviewed implementations, then review the PostgreSQL observations.</p>
        <ul><li>HLD and LLD drawings</li><li>Three explicit design choices</li><li>Seven named database checks</li></ul>
        <Link className="button primary" href="/lab">Open architecture lab <span aria-hidden="true">→</span></Link>
      </article>
      <article className="practice-card debugging-practice">
        <div className="practice-card-top"><span className="eyebrow">AI Debugging Lab</span><span className={`practice-state ${availability.error || (availability.data && !sandboxReady) ? 'unavailable' : ''}`} role="status">
          {availability.loading ? 'Checking availability' : availability.error ? 'Status unavailable' : sandboxReady ? 'Ready to start' : 'Not configured'}
        </span></div>
        <h2>Repair a rate limiter.</h2>
        <p>Inspect the repository, direct a five-prompt coding assistant, review its file changes, run visible tests, and submit to a fresh E2B sandbox.</p>
        <ul><li>Search and read reviewed source files</li><li>See every accepted tool action</li><li>Inspect visible and final test observations</li></ul>
        {availability.loading && <p className="small muted" role="status">Checking the server configuration…</p>}
        {availability.error && <ErrorNotice error={availability.error} retry={availability.reload} />}
        {availability.data && !sandboxReady && <p className="small muted">The server reports that sandbox execution is not configured. The challenge page will show the same state; no session will be started.</p>}
        <Link className={`button ${sandboxReady ? 'primary' : ''}`} href="/lab/ai-debugging">Open AI Debugging Lab <span aria-hidden="true">→</span></Link>
      </article>
    </section>
    <p className="practice-footnote">Test results describe the selected reviewed implementation or submitted sandbox source. They do not assess general skill or prove who authored a change.</p>
  </main>;
}
