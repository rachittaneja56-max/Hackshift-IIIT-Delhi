import { useState } from 'react';
import type { AttemptSummary } from '@trajectoryos/contracts';
import { useApi, useResource } from '../app/context';
import { Link } from '../app/router';
import { Badge, date, Empty, ErrorNotice, Loading, PageTitle, shortId } from '../components/ui';
import { EvaluationPanel } from './evaluation';
import { StartAttempt } from '../attempts/start';

export type HistoryFilter = 'in_progress' | 'completed' | 'execution_error' | 'all';
const filters: { id: HistoryFilter; label: string }[] = [
  { id: 'in_progress', label: 'In progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'execution_error', label: 'Execution error' },
  { id: 'all', label: 'All attempts' },
];

function historyLabel(status: AttemptSummary['status']) {
  if (status === 'draft') return { title: 'Draft', detail: 'Not submitted', action: 'Resume draft', tone: 'warning', href: 'lab' };
  if (status === 'queued') return { title: 'Queued', detail: 'Waiting for evaluation', action: 'View evaluation', tone: '', href: 'evidence' };
  if (status === 'running') return { title: 'Evaluating', detail: 'PostgreSQL checks are running', action: 'View evaluation', tone: '', href: 'evidence' };
  if (status === 'execution_error') return { title: 'Execution error', detail: 'Infrastructure stopped the run · no test verdict', action: 'View run status', tone: 'fail', href: 'evidence' };
  return { title: 'Completed', detail: 'Evaluation finished · review actual test outcomes', action: 'View evidence', tone: 'pass', href: 'evidence' };
}

function inFilter(item: AttemptSummary, filter: HistoryFilter) {
  if (filter === 'all') return true;
  if (filter === 'in_progress') return ['draft', 'queued', 'running'].includes(item.status);
  if (filter === 'execution_error') return item.status === 'execution_error';
  return item.status === 'evaluated';
}

export function HistoryRecords({ items, filter, onFilter }: { items: AttemptSummary[]; filter: HistoryFilter; onFilter: (filter: HistoryFilter) => void }) {
  const counts = Object.fromEntries(filters.map(option => [option.id, items.filter(item => inFilter(item, option.id)).length])) as Record<HistoryFilter, number>;
  const visible = items.filter(item => inFilter(item, filter)).sort((a, b) => {
    const rank = (item: AttemptSummary) => item.status === 'draft' ? 0 : item.status === 'queued' ? 1 : item.status === 'running' ? 2 : item.status === 'evaluated' ? 3 : 4;
    return rank(a) - rank(b);
  });

  return <section className="history-records" aria-label="Attempt history">
    <div className="history-filters" role="group" aria-label="Filter attempts">{filters.map(option => <button key={option.id} type="button" aria-pressed={filter === option.id} onClick={() => onFilter(option.id)}>{option.label}<span>{counts[option.id]}</span></button>)}</div>
    <div id="history-results" className="history-list" aria-live="polite">
      {visible.length ? visible.map(item => {
        const state = historyLabel(item.status);
        return <article className={`history-row history-${item.status}`} key={item.id}>
          <div className="history-date"><small><time dateTime={item.createdAt}>Created {date(item.createdAt)}</time></small><code>{shortId(item.id)}</code></div>
          <div className="history-summary"><h2>Retry-safe account credits</h2><p>Challenge v{item.challenge.version}{item.submittedAt ? ` · submitted ${date(item.submittedAt)}` : ' · no submission yet'}</p><small>{state.detail}</small></div>
          <Badge tone={state.tone}>{state.title}</Badge>
          <Link className={`button ${item.status === 'draft' ? 'primary' : ''}`} href={`/${state.href}/attempts/${item.id}`}>{state.action} <span aria-hidden="true">→</span></Link>
        </article>;
      }) : <div className="history-filter-empty"><h3>{filter === 'in_progress' ? 'No work in progress.' : filter === 'completed' ? 'No completed evaluations yet.' : filter === 'execution_error' ? 'No execution errors.' : 'No attempts in this page.'}</h3><p>{filter === 'in_progress' ? 'Start the lab when you are ready to save a design.' : 'Your other history remains available in the All attempts filter.'}</p></div>}
    </div>
  </section>;
}

export function HistoryPage() {
  const { api, userId } = useApi();
  const first = useResource(() => api.history(), `${userId}:history`);
  const [extra, setExtra] = useState<AttemptSummary[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error>();
  const [filter, setFilter] = useState<HistoryFilter>('in_progress');
  const next = cursor === undefined ? first.data?.nextCursor : cursor;
  const more = async () => {
    if (!next || busy) return;
    setBusy(true);
    try { const page = await api.history(next); setExtra(items => [...items, ...page.items]); setCursor(page.nextCursor); setError(undefined); }
    catch (cause) { setError(cause instanceof Error ? cause : new Error('History page failed.')); }
    finally { setBusy(false); }
  };
  const items = [...(first.data?.items ?? []), ...extra].filter((item, index, all) => all.findIndex(other => other.id === item.id) === index);
  return <main id="main-content" tabIndex={-1} className="page history-page">
    <PageTitle eyebrow="My Evidence / Engineering history" title="Your work, drafts and observed results."><p className="lead">Each attempt stays separate. Resume a draft, follow an evaluation, or inspect the checks that finished.</p></PageTitle>
    <ErrorNotice error={first.error ?? error} retry={first.error ? first.reload : undefined} />
    {first.loading ? <Loading label="Loading your owned attempts…" /> : items.length ? <>
      <div className="history-heading"><div><span className="eyebrow">Recent attempts</span><p className="small muted">Drafts are listed first. Evaluation errors have no test verdict.</p></div>
        {next ? <button disabled={busy} onClick={() => void more()}>{busy ? 'Loading older attempts…' : 'Load older attempts'}</button> : <StartAttempt label="Start an engineering lab attempt" />}
      </div>
      <HistoryRecords items={items} filter={filter} onFilter={setFilter} />
      {next && <button className="load-more" disabled={busy} onClick={() => void more()}>{busy ? 'Loading more…' : 'Load older attempts'}</button>}
    </> : !first.error && <Empty title="No attempts have been saved yet."><p>Read the available lesson, then start the retry-safe credits lab. Your draft will appear here as soon as it is created.</p><div className="actions"><Link className="button" href="/learn/retry-safe-writes/1">Read the lesson</Link><Link className="button primary" href="/lab">Open the engineering lab</Link></div></Empty>}
  </main>;
}

export function EvidencePage({ id }: { id: string }) {
  const { api, userId } = useApi();
  const attempt = useResource(() => api.attempt(id), `${userId}:${id}:evidence-attempt`);
  return <main id="main-content" tabIndex={-1} className="page evidence-page"><Link className="back-link" href="/evidence">← Engineering history</Link>{attempt.loading ? <Loading label="Loading your attempt…" /> : attempt.error ? <ErrorNotice error={attempt.error} retry={attempt.reload} /> : attempt.data && <>
    <PageTitle eyebrow={`Owned attempt ${shortId(id)} · challenge v${attempt.data.challenge.version}`} title="What this run observed."><p className="muted">Created {date(attempt.data.createdAt)} · revision {attempt.data.revision} · status {attempt.data.status}{attempt.data.submittedAt && ` · submitted ${date(attempt.data.submittedAt)}`}</p></PageTitle>
    <div className="context-actions"><Link className="button" href={`/lab/attempts/${id}`}>{attempt.data.status === 'draft' ? 'Resume draft' : 'View frozen workspace'} <span aria-hidden="true">→</span></Link><Link className="button" href={`/mentors/preview?attempt=${id}`}>Prepare mentor context <Badge>Preview</Badge></Link><Link className="button" href={`/career/preview?attempt=${id}`}>Review career evidence <Badge>Preview</Badge></Link></div>
    <EvaluationPanel attempt={attempt.data} />
  </>}</main>;
}
