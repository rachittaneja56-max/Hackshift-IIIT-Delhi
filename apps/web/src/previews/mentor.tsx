import { useEffect, useState } from 'react';
import type { Artifact } from '@trajectoryos/contracts';
import { useApi } from '../app/context';
import { Link } from '../app/router';
import { Badge, Empty, ErrorNotice, Loading, PageTitle, shortId } from '../components/ui';
import { SceneView } from '../drawing/Scene';
import { mentor } from './fixtures';
import { mentorPacket } from './model';
import { RecordSelector, useOwnedSelection } from './selection';

const artifactLabels: Record<string, string> = { hld: 'High-level design', lld: 'Low-level design', aiCritique: 'AI suggestion critique', repairJustification: 'Repair justification', comments: 'Initial hypothesis and investigation notes' };

export function MentorPacketContents({ packet, selected, artifact }: { packet: ReturnType<typeof mentorPacket>; selected: string[]; artifact: Artifact | undefined }) {
  const fields = packet as unknown as Record<string, unknown>;
  const tests = Array.isArray(fields.tests) ? fields.tests as { id: string; status: string }[] : [];
  const selectedFields = selected.filter(key => key in artifactLabels);
  return <section className="mentor-packet-readable" aria-label="Prepared review request">
    <div className="section-heading"><div><span className="eyebrow">Prepared review request</span><h3>Context the fictional reviewer would see</h3></div><Badge>Private · not sent</Badge></div>
    <dl className="packet-facts"><dt>Attempt</dt><dd><code>{packet.attemptId}</code></dd>{packet.evidenceId && <><dt>Evidence</dt><dd><code>{packet.evidenceId}</code></dd></>}<dt>Artifact source</dt><dd>{packet.artifactSource}</dd></dl>
    <h4>Selected materials</h4>{selectedFields.length ? <ul className="packet-materials">{selectedFields.map(key => {
      const value = fields[key];
      const detail = key === 'hld' || key === 'lld' ? artifact?.[key] ? `${artifact[key]?.elements.length ?? 0} saved drawing elements` : 'No drawing was saved in this attempt' : typeof value === 'string' ? value : 'Included';
      return <li key={key}><strong>{artifactLabels[key]}</strong><span>{detail}</span></li>;
    })}</ul> : <p className="muted">No artifact or reasoning fields are selected.</p>}
    {tests.length > 0 && <><h4>Selected test observations</h4><ul className="packet-tests">{tests.map(test => <li key={test.id}><strong>{test.id}</strong><span className={test.status === 'passed' ? 'pass-text' : 'fail-text'}>{test.status}</span></li>)}</ul></>}
    <h4>Focused question</h4><p className="packet-question">{packet.question.trim() || 'No question entered yet.'}</p>
    <details><summary>View exact packet data</summary><pre>{JSON.stringify(packet, null, 2)}</pre></details>
  </section>;
}

export function MentorPreview() {
  const state = useOwnedSelection();
  const [selected, setSelected] = useState<string[]>([]);
  const [topic, setTopic] = useState('');
  const [question, setQuestion] = useState('');
  const [example, setExample] = useState(false);
  useEffect(() => { setSelected([]); setTopic(''); setQuestion(''); setExample(false); }, [state.selected]);
  const data = state.record.data;
  const artifact = data?.evidence?.artifact ?? data?.attempt.artifact;
  const packetQuestion = topic ? `Focus: ${topic}\n\n${question}` : question;
  const packet = data ? mentorPacket(data.attempt, data.evidence, selected, packetQuestion) : null;
  const toggle = (id: string) => setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  const selectedScenes = (['hld', 'lld'] as const).filter(key => selected.includes(key) && artifact?.[key]);

  return <main id="main-content" tabIndex={-1} className="page preview-page mentor-page">
    <PageTitle eyebrow="Mentor guidance / Demo" title="Prepare a focused question about your work."><p className="lead">Choose an owned attempt, pick a topic, and decide exactly which materials belong in a private sample review packet.</p></PageTitle>
    <section className="mentor-profile"><div className="avatar" aria-hidden="true">MS</div><div><span className="eyebrow">Demo mentor · no request sent</span><h2>{mentor.name}</h2><p>{mentor.focus}</p></div><Badge>Local sample only</Badge></section>
    <RecordSelector state={state} />
    {state.selected && state.record.loading ? <Loading label="Checking access and loading the selected attempt…" /> : state.record.error ? <ErrorNotice error={state.record.error} retry={state.record.reload} /> : !data && state.history.error ? <Empty title="Attempt history is unavailable."><p>Retry the history request above. No demonstration record will be substituted.</p></Empty> : !data ? <Empty title="Choose an attempt to prepare context."><p>Only an attempt you own can be included. Drafts are available, but they have no evaluation observations.</p><Link href="/evidence">View your history →</Link></Empty> : <>
      <div className="mentor-attempt-summary"><span className="eyebrow">Selected owned attempt · {shortId(data.attempt.id)}</span><p>{data.evidence ? 'Completed attempt · immutable evidence is available.' : `Saved ${data.attempt.status} · no evaluation evidence is available.`}</p></div>
      <div className="preview-columns mentor-columns">
        <section className="mentor-context-form"><span className="eyebrow">01 / Choose context</span><h2>What help would be useful?</h2>
          <fieldset className="context-topics"><legend>Choose one topic</legend>{['System boundaries', 'Retries and idempotency', 'Transactions and concurrency', 'Reading test observations'].map(value => <label key={value} className={topic === value ? 'selected' : ''}><input type="radio" name="mentor-topic" value={value} checked={topic === value} onChange={() => setTopic(value)} />{value}</label>)}</fieldset>
          <fieldset className="context-checks"><legend>Drawings and written reasoning · initially unchecked</legend>{Object.entries(artifactLabels).map(([key, label]) => <label key={key}><input type="checkbox" checked={selected.includes(key)} onChange={() => toggle(key)} />{label}</label>)}</fieldset>
          <fieldset className="context-checks"><legend>Test observations</legend>{data.evidence ? data.evidence.result.tests.map(test => <label key={test.id}><input type="checkbox" checked={selected.includes(test.id)} onChange={() => toggle(test.id)} /><strong>{test.id}</strong><span className={test.status === 'passed' ? 'pass-text' : 'fail-text'}>{test.status}</span></label>) : <p>This attempt is still a draft. Submit it and wait for evaluation to create test observations.</p>}</fieldset>
          <label className="field" htmlFor="mentor-question">Your focused question<textarea id="mentor-question" value={question} maxLength={2000} onChange={event => setQuestion(event.target.value)} placeholder="Which transaction boundary or returned observation would you like to understand?" /></label>
          <p className="small muted">Selecting or editing context does not send a message. The selected topic and materials appear in the packet preview only.</p>
        </section>
        <section className="mentor-packet">
          <span className="eyebrow">02 / Preview</span>
          <MentorPacketContents packet={packet!} selected={selected} artifact={artifact} />
          {selectedScenes.map(key => <div className="snapshot-viewer" key={key}><SceneView sceneKey={`${data.attempt.id}:mentor:${key}`} scene={artifact![key]} name={`Selected ${key.toUpperCase()} scene`} readOnly /></div>)}
          <button type="button" aria-expanded={example} onClick={() => setExample(value => !value)}>{example ? 'Hide seeded sample' : 'View seeded sample response'}</button>
          {example && <div className="notice mentor-example"><Badge>Seeded example · no live mentor</Badge><p>{mentor.seededResponse}</p></div>}
        </section>
      </div>
    </>}
    <p className="planned-note">Mentor discovery, live messaging, booking and availability are future features.</p>
  </main>;
}
