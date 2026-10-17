import { useState } from 'react';
import type { Artifact, EvaluationResult } from '@trajectoryos/contracts';
import type { Evidence } from '../lib/api';
import { Badge } from '../components/ui';
import { SceneView } from '../drawing/Scene';
import { variantLabel } from '../attempts/workspace';
import { FeedbackPanel } from './feedback';
import { observationSummary } from '../lib/presentation';

export function ArtifactSnapshot({ artifact, identity }: { artifact: Artifact; identity: string }) {
  const [scene, setScene] = useState<'hld' | 'lld' | null>(null);
  return <section className="artifact-snapshot" aria-labelledby="submitted-artifact-heading">
    <span className="eyebrow">Submitted artifact · human review</span><h2 id="submitted-artifact-heading">What you submitted.</h2>
    <p className="muted">The selected implementation is reviewed challenge source. Its passing tests do not establish that you authored or implemented it.</p>
    <dl><dt>Selected implementation</dt><dd>{variantLabel(artifact.variantId)} <code>{artifact.variantId ?? 'Not selected'}</code></dd><dt>Idempotency key scope</dt><dd>{artifact.decisions.keyScope ?? 'Not selected'}</dd><dt>Database write boundary</dt><dd>{artifact.decisions.atomicity ?? 'Not selected'}</dd><dt>Changed-payload behavior</dt><dd>{artifact.decisions.payloadConflict ?? 'Not selected'}</dd></dl>
    <div className="submitted-scenes"><h3>Saved design scenes</h3><div className="actions">{(['hld', 'lld'] as const).map(name => <button key={name} aria-pressed={scene === name} onClick={() => setScene(scene === name ? null : name)} disabled={!artifact[name]}>View saved {name.toUpperCase()} {artifact[name] ? '→' : '(missing)'}</button>)}</div><p className="small muted">Drawing contents are shown as submitted. They were not automatically graded.</p></div>
    {scene && <div className="snapshot-viewer"><SceneView sceneKey={`${identity}:${scene}`} scene={artifact[scene]} name={`Saved ${scene.toUpperCase()}`} readOnly /></div>}
    <div className="reasoning-grid"><section><h3>AI suggestion critique</h3><Badge>Self-reported · human review</Badge><p className="preserve-whitespace">{artifact.aiCritique || 'No critique saved.'}</p></section><section><h3>Repair justification</h3><Badge>Self-reported · human review</Badge><p className="preserve-whitespace">{artifact.repairJustification || 'No justification saved.'}</p></section></div>
    {artifact.comments && <section className="submitted-notes"><h3>Initial hypothesis and investigation notes</h3><Badge>Self-reported · human review</Badge><p className="preserve-whitespace">{artifact.comments}</p></section>}
  </section>;
}

export const testDescription: Record<string, string> = {
  T1: 'One valid credit stores one operation, ledger entry and replayable response.',
  T2: 'Sequential retries, including a fresh module instance, replay without another credit.',
  T3: 'Concurrent duplicate requests on independent PostgreSQL clients replay one effect.',
  T4: 'A changed amount with the same account and key returns 409 without a write.',
  T5: 'Injected failure after balance mutation rolls back all effects; retry succeeds.',
  T6: 'The same key on two accounts creates independent operations.',
  T7: 'Concurrent distinct keys on one account preserve both credits.',
};

const testGroups = [
  { title: 'A valid operation', ids: ['T1'] },
  { title: 'Retries and concurrency', ids: ['T2', 'T3'] },
  { title: 'Payload conflicts', ids: ['T4'] },
  { title: 'Rollback and retry', ids: ['T5'] },
  { title: 'Independent accounts and keys', ids: ['T6', 'T7'] },
];

function observationFacts(value: unknown, path = ''): { path: string; value: string }[] {
  if (Array.isArray(value)) return value.length ? value.flatMap((item, index) => observationFacts(item, `${path}[${index}]`)) : [{ path: path || 'value', value: '[]' }];
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    return entries.length ? entries.flatMap(([key, child]) => observationFacts(child, path ? `${path}.${key}` : key)) : [{ path: path || 'value', value: '{}' }];
  }
  return [{ path: path || 'value', value: typeof value === 'string' ? value : JSON.stringify(value) ?? 'null' }];
}

function ObservationFacts({ label, value }: { label: string; value: unknown }) {
  const summary = observationSummary(value);
  return <section className="observation-card"><h4>{label}</h4><dl className="observation-facts">{observationFacts(summary).map((fact, index) => <div key={`${fact.path}-${index}`}><dt>{fact.path}</dt><dd><code>{fact.value}</code></dd></div>)}</dl><details><summary>View compact technical summary</summary><pre>{JSON.stringify(summary, null, 2)}</pre></details></section>;
}

export function Results({ result, selected, select }: { result: EvaluationResult; selected: string; select: (id: string) => void }) {
  const test = result.tests.find(item => item.id === selected) ?? result.tests[0];
  const passed = result.tests.filter(item => item.status === 'passed').length;
  return <section className="results" aria-labelledby="results-heading">
    <div className="section-heading"><div><span className="eyebrow">Actual PostgreSQL observations</span><h2 id="results-heading">What the disclosed checks observed.</h2><p className="muted">{passed} of {result.tests.length} observed checks passed in this run. This is a run summary, not a skill score.</p></div><Badge tone={result.verdict === 'all_passed' ? 'pass' : 'fail'}>{result.verdict === 'all_passed' ? 'All checks passed' : 'Some checks failed'}</Badge></div>
    <div className="table-scroll"><table><caption className="sr-only">Disclosed test observations. Select a check to compare expected and observed values.</caption><thead><tr><th>Check</th><th>What it checks</th><th>Observed status</th><th>Duration</th><th><span className="sr-only">Details</span></th></tr></thead>
      {[...testGroups, { title: 'Other returned checks', ids: result.tests.map(item => item.id).filter(id => !testGroups.some(group => group.ids.includes(id))) }].map(group => { const tests = result.tests.filter(item => group.ids.includes(item.id)); return tests.length ? <tbody key={group.title}><tr className="test-group-heading"><th colSpan={5}>{group.title}</th></tr>{tests.map(item => <tr key={item.id} id={`test-${item.id}`} className={test?.id === item.id ? 'selected' : ''}><th scope="row">{item.id}</th><td>{testDescription[item.id] ?? 'Returned test observation'}</td><td><span className={item.status === 'passed' ? 'pass-text' : 'fail-text'}>{item.status === 'passed' ? 'Passed' : 'Failed'}</span></td><td>{item.durationMs.toLocaleString()} ms</td><td><button aria-pressed={test?.id === item.id} onClick={() => select(item.id)}>Inspect <span className="sr-only">{item.id}</span>→</button></td></tr>)}</tbody> : null; })}
    </table></div>
    {test && <div className="selected-test"><span className="eyebrow">Selected check · {test.id}</span><h3>{testDescription[test.id] ?? 'Returned test observation'}</h3><div className="expected-observed"><ObservationFacts label="Expected" value={test.expected} /><ObservationFacts label={`Observed · ${test.status}`} value={test.observed} /></div><details><summary>Expand complete raw test record · {test.id}</summary><pre>{JSON.stringify(test, null, 2)}</pre></details></div>}
  </section>;
}

export function EvidenceDetails({ evidence }: { evidence: Evidence }) {
  const [selected, select] = useState(evidence.result.tests[0]?.id ?? '');
  return <>
    <ArtifactSnapshot artifact={evidence.artifact} identity={evidence.id} />
    <Results result={evidence.result} selected={selected} select={select} />
    <section className="limitations"><span className="eyebrow">Limits of this record</span><h3>What the run can and cannot establish.</h3><ul>{evidence.limitations.map((line, index) => <li key={index}>{line}</li>)}</ul><p>Execution uses synthetic fixture credits. No real money is represented. Selecting an implementation does not establish learner authorship.</p></section>
    <FeedbackPanel evidenceId={evidence.id} testIds={evidence.result.tests.map(item => item.id)} selectTest={select} />
    <section className="provenance"><span className="eyebrow">Trace the evidence</span><h2>Build and run details.</h2><p>These identifiers locate the challenge content, selected source, test suite and database run that produced this immutable record. Feedback is a separate interpretation.</p><details><summary>Full returned provenance</summary><dl>{Object.entries(evidence.provenance).map(([key, value]) => <div key={key}><dt>{key}</dt><dd className="hash">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd></div>)}</dl></details><details><summary>Complete immutable record</summary><pre>{JSON.stringify({ id: evidence.id, evaluationId: evidence.evaluationId, attemptId: evidence.attemptId, createdAt: evidence.createdAt, artifact: evidence.artifact, provenance: evidence.provenance, result: evidence.result, limitations: evidence.limitations }, null, 2)}</pre></details><p className="small muted">Current feedback status: {evidence.feedbackStatus} · The API does not expose an evidence snapshot hash.</p></section>
  </>;
}
