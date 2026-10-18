import { useState } from 'react';
import type { Artifact, EvaluationResult } from '@trajectoryos/contracts';
import type { Evidence } from '../lib/api';
import { Badge } from '../components/ui';
import { SceneView } from '../drawing/Scene';
import { variantLabel } from '../attempts/workspace';
import { FeedbackPanel } from './feedback';
import { DesignReviewPanel } from './design-review';
import { decisionLabel, observationSummary, testLabel } from '../lib/presentation';

export function ArtifactSnapshot({ artifact, identity }: { artifact: Artifact; identity: string }) {
  const [scene, setScene] = useState<'hld' | 'lld' | null>(null);
  return <section className="artifact-snapshot" aria-labelledby="submitted-artifact-heading">
    <span className="eyebrow">Submitted artifact · human review</span><h2 id="submitted-artifact-heading">What you submitted.</h2>
    <p className="muted">The selected implementation is reviewed challenge source. Its passing tests do not establish that you authored or implemented it.</p>
    <dl><dt>Selected implementation</dt><dd>{variantLabel(artifact.variantId)}</dd><dt>Idempotency key scope</dt><dd>{decisionLabel('keyScope', artifact.decisions.keyScope)}</dd><dt>Database write boundary</dt><dd>{decisionLabel('atomicity', artifact.decisions.atomicity)}</dd><dt>Changed-payload behavior</dt><dd>{decisionLabel('payloadConflict', artifact.decisions.payloadConflict)}</dd></dl>
    <details><summary>Advanced: implementation identifier</summary><code>{artifact.variantId ?? 'Not selected'}</code></details>
    <div className="submitted-scenes"><h3>Saved design scenes</h3><div className="actions">{(['hld', 'lld'] as const).map(name => <button key={name} aria-pressed={scene === name} onClick={() => setScene(scene === name ? null : name)} disabled={!artifact[name]}>View saved {name.toUpperCase()} {artifact[name] ? '→' : '(missing)'}</button>)}</div><p className="small muted">Drawing contents are shown as submitted. They were not automatically graded.</p></div>
    {scene && <div className="snapshot-viewer"><SceneView sceneKey={`${identity}:${scene}`} scene={artifact[scene]} name={`Saved ${scene.toUpperCase()}`} readOnly /></div>}
    <div className="reasoning-grid"><section><h3>AI suggestion critique</h3><Badge>Self-reported · human review</Badge><p className="preserve-whitespace">{artifact.aiCritique || 'No critique saved.'}</p></section><section><h3>Repair justification</h3><Badge>Self-reported · human review</Badge><p className="preserve-whitespace">{artifact.repairJustification || 'No justification saved.'}</p></section></div>
    {artifact.comments && <section className="submitted-notes"><h3>Initial hypothesis and investigation notes</h3><Badge>Self-reported · human review</Badge><p className="preserve-whitespace">{artifact.comments}</p></section>}
  </section>;
}

export const testDescription = Object.fromEntries(['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map(id => [id, testLabel(id)])) as Record<string, string>;

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
  const passed = evidence.result.tests.filter(test => test.status === 'passed').length;
  const failed = evidence.result.tests.length - passed;
  return <>
    <section className="evidence-summary" aria-labelledby="evidence-summary-heading">
      <div><span className="eyebrow">Evidence summary</span><h2 id="evidence-summary-heading">What this run records.</h2></div>
      <dl><div><dt>Challenge</dt><dd>Retry-safe account credits</dd></div><div><dt>Implementation selected</dt><dd>{variantLabel(evidence.artifact.variantId)}</dd></div><div><dt>Evaluation finished</dt><dd>{new Date(evidence.provenance.finishedAt).toLocaleDateString()}</dd></div><div><dt>Checks</dt><dd>{passed} passed · {failed} failed</dd></div><div><dt>Execution source</dt><dd>{evidence.provenance.isSynthetic ? 'Test credits (no real money)' : 'PostgreSQL execution'}</dd></div></dl>
      <p>These checks record specific database behavior in this run. They do not prove every production failure mode, the quality of your diagrams, or who authored the reviewed implementation.</p>
      <a className="text-action" href="#saved-designs">View saved diagrams and design feedback ↓</a>
    </section>
    <ArtifactSnapshot artifact={evidence.artifact} identity={evidence.id} />
    <DesignReviewPanel evidenceId={evidence.id} artifact={evidence.artifact} />
    <Results result={evidence.result} selected={selected} select={select} />
    <section className="limitations"><span className="eyebrow">Limits of this record</span><h3>What the run can and cannot establish.</h3><ul>{evidence.limitations.map((line, index) => <li key={index}>{line}</li>)}</ul><p>Execution uses synthetic fixture credits. No real money is represented. Selecting an implementation does not establish learner authorship.</p></section>
    <FeedbackPanel evidenceId={evidence.id} testIds={evidence.result.tests.map(item => item.id)} selectTest={select} />
    <section className="provenance"><span className="eyebrow">Advanced details</span><h2>Verification and run identifiers.</h2><p>Exact technical provenance is available for review and support.</p><details><summary>Advanced: verification and run identifiers</summary><h3>Challenge and content</h3><dl className="provenance-group">{[['challenge', `${evidence.provenance.challenge.slug} v${evidence.provenance.challenge.version}`], ['contentSha256', evidence.provenance.contentSha256], ['manifestSha256', evidence.provenance.manifestSha256]].map(([key, value]) => <div key={String(key)}><dt>{key}</dt><dd className="hash"><code>{value}</code></dd></div>)}</dl><h3>Evaluator and test suite</h3><dl className="provenance-group">{[['runnerKind', evidence.provenance.runnerKind], ['suiteVersion', evidence.provenance.suiteVersion], ['suiteSha256', evidence.provenance.suiteSha256], ['implementationSha256', evidence.provenance.implementationSha256]].map(([key, value]) => <div key={String(key)}><dt>{key}</dt><dd className="hash"><code>{value}</code></dd></div>)}</dl><h3>Runtime and database</h3><dl className="provenance-group">{[['databaseVersion', evidence.provenance.databaseVersion], ['appCommit', evidence.provenance.appCommit], ['isSynthetic', evidence.provenance.isSynthetic]].map(([key, value]) => <div key={String(key)}><dt>{key}</dt><dd className="hash"><code>{value}</code></dd></div>)}</dl><h3>Hashes and run identifiers</h3><dl className="provenance-group">{[['artifactSha256', evidence.provenance.artifactSha256], ['runId', evidence.provenance.runId], ['generation', evidence.provenance.generation], ['startedAt', evidence.provenance.startedAt], ['finishedAt', evidence.provenance.finishedAt]].map(([key, value]) => <div key={String(key)}><dt>{key}</dt><dd className="hash"><code>{value ?? 'Not recorded'}</code></dd></div>)}</dl></details><details><summary>Complete immutable record</summary><pre>{JSON.stringify({ id: evidence.id, evaluationId: evidence.evaluationId, attemptId: evidence.attemptId, createdAt: evidence.createdAt, artifact: evidence.artifact, provenance: evidence.provenance, result: evidence.result, limitations: evidence.limitations }, null, 2)}</pre></details><p className="small muted">Current feedback status: {evidence.feedbackStatus} · The API does not expose an evidence snapshot hash.</p></section>
  </>;
}
