import { useState } from 'react';
import type { AttemptDto } from '@trajectoryos/contracts';
import { useApi, useResource } from '../app/context';
import { Link } from '../app/router';
import { Badge, ErrorNotice, Loading, shortId } from '../components/ui';
import { usePolling } from './polling';
import { EvidenceDetails } from './details';
export function EvaluationPanel({ attempt }: { attempt: AttemptDto }) {
  if (!attempt.evaluationId) return <div className="empty"><span className="eyebrow">Evidence starts with a submitted artifact</span><h2>Your investigation is still a draft.</h2><p>Complete both drawings, decisions and reasoning, then review and submit the saved revision.</p><Link className="button" href={`/lab/attempts/${attempt.id}?tab=code`}>Continue investigation →</Link></div>;
  return <EvaluationLifecycle key={attempt.evaluationId} evaluationId={attempt.evaluationId} />;
}
function EvaluationLifecycle({ evaluationId }: { evaluationId: string }) {
  const { api, userId } = useApi(); const evaluation = usePolling(() => api.evaluation(evaluationId), `${userId}:${evaluationId}`, v => v.status === 'queued' || v.status === 'running');
  const [busy, setBusy] = useState(false), [error, setError] = useState<Error>(); const e = evaluation.data;
  const retry = async () => { if (busy) return; setBusy(true); setError(undefined); try { evaluation.update(await api.retry(evaluationId)); } catch (e) { setError(e instanceof Error ? e : new Error('Infrastructure retry failed.')); } finally { setBusy(false); } };
  const label = e?.status === 'queued' ? 'Waiting to start' : e?.status === 'running' ? 'Evaluating' : e?.status === 'completed' ? 'Results ready' : 'Evaluation needs attention';
  return <><ErrorNotice error={evaluation.error ?? error} retry={evaluation.error ? evaluation.reload : undefined} />{!e && !evaluation.error && <Loading label="Checking evaluation status…" />}{e && <><div className="evaluation-state"><Badge tone={e.status === 'error' ? 'fail' : ''}>{label}</Badge><details><summary>Technical details</summary><span>Evaluation {shortId(e.id)} · generation {e.generation} · {e.executionCount} executions</span></details></div>{['queued', 'running'].includes(e.status) && <div className="pending-run" role="status"><span className="eyebrow">Your submission is saved</span><h2>{e.status === 'queued' ? 'Waiting to start the evaluation.' : 'PostgreSQL checks are in progress.'}</h2><p>No result is available yet. You can leave this page and resume from My Work. Status checks pause while this tab is hidden.</p></div>}{e.status === 'error' && <div className="notice error"><h2>The evaluation could not finish.</h2><p>{e.error?.message}</p><details><summary>Technical details</summary><p>{e.error?.code} · No test verdict was recorded.</p></details>{e.error?.retryable && e.executionCount < 2 ? <button disabled={busy} onClick={() => void retry()}>{busy ? 'Requesting retry…' : 'Retry evaluation'}</button> : <p>No further retry is available.</p>}</div>}{e.status === 'completed' && (e.evidenceId ? <StoredEvidence key={e.evidenceId} id={e.evidenceId} /> : <div className="notice error">The evaluation finished without a results record. Refresh status or report this inconsistency.<button onClick={evaluation.reload}>Refresh status</button></div>)}</>}</>;
}
function StoredEvidence({ id }: { id: string }) {
  const { api, userId } = useApi(); const evidence = useResource(() => api.evidence(id), `${userId}:${id}:evidence`);
  return evidence.loading ? <Loading label="Loading immutable evidence…" /> : evidence.error ? <ErrorNotice error={evidence.error} retry={evidence.reload} /> : evidence.data ? <EvidenceDetails evidence={evidence.data} /> : null;
}
