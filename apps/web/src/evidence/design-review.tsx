import { useState } from 'react';
import type { Artifact, DesignCriterion, DesignFinding, DesignFindingStatus, DesignSection } from '@trajectoryos/contracts';
import { useApi } from '../app/context';
import { Badge, ErrorNotice, Loading } from '../components/ui';
import { SceneView } from '../drawing/Scene';
import { usePolling } from './polling';

const criterionLabels: Record<DesignCriterion, string> = {
  system_boundaries: 'System boundaries', application_retry_path: 'Application retry path',
  idempotency_owner: 'Idempotency decision owner', durable_state: 'Durable idempotency state',
  response_loss_boundary: 'Response loss after commit', external_dependencies: 'External dependencies',
  account_scoped_key: 'Account scoped key', payload_conflict: 'Changed payload conflict',
  transaction_boundary: 'Transaction boundary', write_order: 'Write order', stored_response: 'Stored response and replay',
  rollback_behavior: 'Rollback behavior', concurrency: 'Concurrent requests',
};
const statusLabels: Record<DesignFindingStatus, string> = {
  explicitly_shown: 'Explicitly shown', ambiguous: 'Ambiguous',
  not_clearly_shown: 'Not clearly shown', not_assessable: 'Not assessable',
};
const statusTone: Record<DesignFindingStatus, string> = {
  explicitly_shown: 'pass', ambiguous: 'warning', not_clearly_shown: 'warning', not_assessable: '',
};

export function ReviewFindings({ title, section }: { title: string; section: DesignSection }) {
  return <section className="design-findings" aria-label={`${title} findings`}>
    <h3>{title} analysis</h3>
    <div className="design-finding-list">{section.findings.map((finding: DesignFinding) => <article className="design-finding" key={finding.criterion}>
      <div className="section-heading"><h4>{criterionLabels[finding.criterion]}</h4><Badge tone={statusTone[finding.status]}>{statusLabels[finding.status]}</Badge></div>
      <p>{finding.explanation}</p>
      {(finding.evidenceElements.length > 0 || finding.connectionIds.length > 0) && <div className="design-citations" aria-label="Diagram evidence references">
        {finding.evidenceElements.map((reference, index) => <span className="design-citation" key={`${reference.elementId}-${index}`}><code>Element {reference.elementId}</code>{reference.excerpt !== null && <q>{reference.excerpt}</q>}</span>)}
        {finding.connectionIds.map(id => <span className="design-citation" key={id}><code>Connection {id}</code></span>)}
      </div>}
      {finding.nextStep && <p className="design-next-step"><strong>Consider:</strong> {finding.nextStep}</p>}
    </article>)}</div>
    {section.observedElements.length > 0 && <details className="design-observations"><summary>Observed diagram labels and connections</summary><ul>{section.observedElements.map((observation, index) => <li key={`${observation.text}-${index}`}>
      <span>{observation.text}</span><span className="design-citations">{observation.evidenceElements.map((reference, refIndex) => <code key={`${reference.elementId}-${refIndex}`}>Element {reference.elementId}{reference.excerpt !== null ? ` · “${reference.excerpt}”` : ''}</code>)}{observation.connectionIds.map(id => <code key={id}>Connection {id}</code>)}</span>
    </li>)}</ul></details>}
    {section.questions.length > 0 && <div className="design-questions"><h4>Questions to take back to your design</h4><ul>{section.questions.map(question => <li key={question}>{question}</li>)}</ul></div>}
    {section.limitations.length > 0 && <ul className="design-limitations">{section.limitations.map(item => <li key={item}>{item}</li>)}</ul>}
  </section>;
}

export function DesignReviewPanel({ evidenceId, artifact }: { evidenceId: string; artifact: Artifact }) {
  const { api, userId } = useApi();
  const review = usePolling(() => api.designReview(evidenceId), `${userId}:${evidenceId}:design-review`, value => value.status === 'generating');
  const [busy, setBusy] = useState(false);
  const [requestError, setRequestError] = useState<Error>();
  const result = review.data;
  const request = async (retry = false) => {
    if (busy) return;
    setBusy(true); setRequestError(undefined);
    try { review.update(await api.requestDesignReview(evidenceId, retry)); }
    catch (error) { setRequestError(error instanceof Error ? error : new Error('Design review request failed.')); }
    finally { setBusy(false); }
  };
  const needsRetry = result?.status === 'unavailable' || (result?.status === 'limited' && result.failureCode !== null && result.failureCode !== 'AI_DISABLED');
  return <section className="design-review" id="saved-designs" aria-labelledby="design-review-heading">
    <div className="section-heading"><div><span className="eyebrow">Saved diagram review</span><h2 id="design-review-heading">Review the HLD and LLD.</h2></div>{result && <Badge tone={result.status === 'ready' ? 'pass' : result.status === 'limited' ? 'warning' : ''}>{result.status.replace('_', ' ')}</Badge>}</div>
    <p className="muted">This advisory reads saved Excalidraw element types, text labels, bounds and resolvable connections. It does not inspect pixels, grade your diagrams, or change the PostgreSQL T1–T7 verdict.</p>
    <div className="saved-design-grid">
      {(['hld', 'lld'] as const).map(name => <section className="saved-design-card" key={name} aria-label={`Saved ${name.toUpperCase()} diagram`}>
        <h3>{name.toUpperCase()} · {name === 'hld' ? 'High level' : 'Low level'}</h3>
        {artifact[name] ? <div className="saved-design-canvas"><SceneView sceneKey={`${evidenceId}:review:${name}`} scene={artifact[name]} name={`Saved ${name.toUpperCase()} design`} readOnly /></div> : <p className="empty-scene">No {name.toUpperCase()} scene was included in this evidence.</p>}
      </section>)}
    </div>
    <ErrorNotice error={review.error ?? requestError} retry={review.error ? review.reload : undefined} />
    {!result && !review.error && <Loading label="Checking saved design review status…" />}
    {result?.status === 'not_requested' && <div className="design-review-callout"><p>Request a separate review of what the saved HLD and LLD explicitly show. The configured server provider receives only the bounded diagram structure and the challenge context.</p><button className="primary" disabled={busy} onClick={() => void request()}>{busy ? 'Reviewing saved diagrams…' : 'Review my designs'}</button></div>}
    {result?.status === 'generating' && <p className="notice" role="status">The design review is processing. The saved diagrams and test evidence remain available.</p>}
    {result?.status === 'unavailable' && <div className="notice error"><strong>No design review output is available.</strong><p>{result.failureCode ?? 'The previous review did not complete.'}</p><button disabled={busy} onClick={() => void request(true)}>{busy ? 'Retrying review…' : 'Retry design review'}</button></div>}
    {result?.status === 'limited' && <>
      <div className="design-source-note"><Badge tone="warning">Limited deterministic review</Badge><span>{result.failureCode === 'AI_DISABLED' ? 'Model review is disabled in server configuration. The observations below are generated from diagram labels and connections only.' : result.failureCode ? `Model review could not be validated (${result.failureCode}); the observations below use deterministic label matching.` : 'Only labels and resolvable connections were compared with the design topics; no model interpretation was produced.'}</span></div>
      {needsRetry && <button className="secondary" disabled={busy} onClick={() => void request(true)}>{busy ? 'Retrying review…' : 'Retry model review'}</button>}
      {result.hld && <ReviewFindings title="HLD" section={result.hld} />}{result.lld && <ReviewFindings title="LLD" section={result.lld} />}
    </>}
    {result?.status === 'ready' && <>
      <div className="design-source-note"><Badge>{result.provider} · {result.model}</Badge><span>Model assisted · findings cite saved element or connection IDs. Review the source excerpts and use your judgment.</span></div>
      {result.hld && <ReviewFindings title="HLD" section={result.hld} />}{result.lld && <ReviewFindings title="LLD" section={result.lld} />}
    </>}
    {result && result.limitations.length > 0 && <details className="design-global-limitations"><summary>Review scope and limitations</summary><ul>{result.limitations.map(item => <li key={item}>{item}</li>)}</ul></details>}
  </section>;
}
