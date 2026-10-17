import { useEffect, useRef, useState } from 'react';
import { SubmissionReadyArtifactSchema, type Artifact, type ChallengeDto, type VariantId } from '@trajectoryos/contracts';
import { useApi, useResource } from '../app/context';
import { Link, useRouter } from '../app/router';
import { Badge, ErrorNotice, Loading, PageTitle, shortId } from '../components/ui';
import { Markdown } from '../learning/content';
import { drawableCount, sceneElementError } from '../lib/scenes';
import { SceneView } from '../drawing/Scene';
import { useAttempt } from './use-attempt';
import { SaveQueue } from './save-queue';
import { StartAttempt } from './start';
import { EvaluationPanel } from '../evidence/evaluation';
export const variantLabel = (id: string | null) => id === 'credit-first' ? 'Variant A' : id === 'key-only' ? 'Variant B' : id === 'atomic' ? 'Variant C' : 'Not selected';
export function LabLanding() {
  const { api, userId } = useApi();
  const challenge = useResource(() => api.challenge(), `challenge:${userId}`);
  const history = useResource(() => api.history(), `${userId}:lab-history`);
  const attempts = history.data?.items ?? [];
  const drafts = attempts.filter(item => item.status === 'draft');
  const latestDraft = drafts[0];
  const clauses = challenge.data?.requirementMarkdown.replace(/^##[^\n]*\n/, '').split(/(?<=\.)\s+/) ?? [];
  const briefGroups = [
    ['Expected behavior', clauses.slice(0, 3)],
    ['Conflicts and independence', clauses.slice(3, 5)],
    ['Failure and scope', clauses.slice(5)],
  ] as const;
  return <main id="main-content" tabIndex={-1} className="page lab-landing">
    <PageTitle eyebrow="Engineering lab · retry-safe-credit v1" title="How do you stop a retry from writing twice?"><p className="lead">Compare three reviewed implementations, explain the repair you choose, then inspect seven disclosed PostgreSQL checks.</p></PageTitle>
    {challenge.loading ? <Loading label="Loading the engineering brief…" /> : challenge.error ? <ErrorNotice error={challenge.error} retry={challenge.reload} /> : challenge.data && <>
      <div className="lab-intro">
        <section className="problem-brief"><Badge>Approved implementation investigation</Badge><h2>{challenge.data.title}</h2>
          <p className="problem-summary">A credit request may be retried after the response is lost. The operation must return its original result without applying a second credit.</p>
          <div className="brief-groups">{briefGroups.map(([title, items]) => <section key={title}><h3>{title}</h3>{items.length ? <ul>{items.map((clause, index) => <li key={`${title}-${index}`}>{clause}</li>)}</ul> : <p className="muted small">See the full contract.</p>}</section>)}</div>
          <details className="full-contract"><summary>Read the full challenge contract</summary><Markdown text={challenge.data.requirementMarkdown} /></details>
          <ErrorNotice error={history.error} retry={history.reload} />
          {history.loading ? <Loading label="Checking for a saved draft…" /> : latestDraft ? <div className="resume-callout"><div><span className="eyebrow">Draft available</span><p>{drafts.length === 1 ? 'Resume your saved attempt.' : `${drafts.length} recent drafts are available.`}</p></div><Link className="button primary" href={`/lab/attempts/${latestDraft.id}`}>Resume draft →</Link></div> : history.error ? <p className="small muted">Review your history before creating another attempt.</p> : history.data?.nextCursor ? <div className="resume-callout"><div><span className="eyebrow">More history is available</span><p>Check older attempts before starting another draft.</p></div><Link className="button" href="/evidence">Review My Evidence →</Link></div> : <StartAttempt label="Start the engineering lab" />}
          {!history.loading && drafts.length > 1 && <Link className="text-action" href="/evidence">View all {drafts.length} recent drafts →</Link>}
          {!history.loading && history.data?.nextCursor && <Link className="text-action" href="/evidence">Check older attempts in My Evidence →</Link>}
          {latestDraft && <details className="new-attempt-disclosure"><summary>Start a separate attempt</summary><p>Keep this draft and its history intact. A separate attempt begins with empty drawings.</p><StartAttempt label="Create another attempt" /></details>}
        </section>
        <aside className="panel what-youll-build"><span className="eyebrow">What you will submit</span><h3>Draw, choose and explain.</h3><ol><li>Separate high-level and low-level designs</li><li>Three decisions about key scope, write boundaries and payload conflicts</li><li>A selected reviewed implementation, critique and justification</li><li>A frozen record of actual test observations</li></ol><p className="muted">The tests run reviewed code against synthetic credits. Your drawings and reasoning are saved for human review.</p><details><summary>See the seven disclosed checks</summary>{challenge.data.testDescriptions.map(test => <p key={test.id}><strong>{test.id}</strong> · {test.description}</p>)}</details></aside>
      </div>
      <section className="lab-expectations"><span className="eyebrow">Evaluation boundary</span><p>These checks show the selected implementation’s behavior in disclosed cases. They do not execute learner code, grade diagrams or prove who authored the selected implementation.</p><Link href="/evidence">Review a completed record →</Link></section>
    </>}
  </main>;
}
function Requirements({ challenge }: { challenge: ChallengeDto }) {
  return <div className="compact-requirements"><span className="eyebrow">Problem summary</span><p>A client may retry after a response is lost. The API must replay the stored result without applying a second credit.</p>
    <ul><li>Key is scoped to an account.</li><li>Changed payload returns a conflict.</li><li>Balance, operation, ledger and response commit together.</li></ul>
    <details><summary>Full challenge contract</summary><Markdown text={challenge.requirementMarkdown} /></details>
    <details><summary>Seven disclosed checks</summary>{challenge.testDescriptions.map(test => <p key={test.id}><strong>{test.id}</strong> · {test.description}</p>)}</details>
    <details><summary>Limitations</summary>{challenge.limitations.map(line => <p key={line}>{line}</p>)}</details>
    <Link className="small" href="/lab">Challenge overview →</Link>
  </div>;
}
function SaveStatus({ queue }: { queue: SaveQueue }) { return <span className={`save-status ${queue.state === 'Conflict' || queue.state === 'Offline' ? 'warn' : ''}`} role="status">{queue.state === 'Saved' ? `Saved · revision ${queue.server.revision}` : queue.state === 'Frozen' ? `Frozen · revision ${queue.server.revision}` : queue.state}{queue.submitting && ' · Submitting'}</span>; }
function RecoveryDownload({ queue }: { queue: SaveQueue }) { const download = () => { const url = URL.createObjectURL(new Blob([JSON.stringify({ local: queue.local, base: queue.conflictBase ?? queue.server.artifact }, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `trajectoryos-${queue.server.id}-recovery.json`; a.click(); URL.revokeObjectURL(url); }; return <button onClick={download}>Download local recovery</button>; }
function UnsupportedContent({ queue, scene, onRemove }: { queue: SaveQueue; scene: 'hld' | 'lld'; onRemove: () => void }) {
  const elements = queue.local[scene]?.elements ?? [];
  const invalid = elements.map((element, index) => ({ element, index, reason: sceneElementError(element) })).filter(item => item.reason);
  const supported = elements.filter(e => !sceneElementError(e));
  if (!invalid.length) return null;
  return <div className="notice warning"><strong>{invalid.length} unsupported elements cannot be saved.</strong><p>Download the full recovery copy before removing these elements from the local scene. Simple deleted shapes remain preserved.</p><ul>{invalid.map(({ element, index, reason }) => <li key={String(element.id ?? index)}>Element {index + 1} ({String(element.type ?? 'unknown')}): {reason}</li>)}</ul><div className="actions"><RecoveryDownload queue={queue} /><button onClick={() => { queue.edit({ ...queue.local, [scene]: { engine: 'excalidraw', formatVersion: 1, elements: supported } }); onRemove(); }}>Remove unsupported elements from this scene</button></div></div>;
}
function Conflicts({ queue }: { queue: SaveQueue }) {
  if (!queue.conflict) return null;
  return <section className="notice warning"><h2>Two drafts need your review.</h2><p>Your local work is retained. The server is at revision {queue.conflict.revision}. Compare the snapshots before explicitly reapplying all local fields.</p><div className="comparison"><details><summary>Base snapshot</summary><pre>{JSON.stringify(queue.conflictBase, null, 2)}</pre></details><details><summary>Your local snapshot</summary><pre>{JSON.stringify(queue.local, null, 2)}</pre></details><details><summary>Current server snapshot</summary><pre>{JSON.stringify(queue.conflict.artifact, null, 2)}</pre></details></div><div className="actions"><button onClick={() => queue.resolve(false)}>Load server draft</button>{queue.conflict.status === 'draft' && <button onClick={() => queue.resolve(true)}>Reapply local after comparison</button>}<RecoveryDownload queue={queue} /></div></section>;
}
function WorkflowSteps({ active }: { active: 'design' | 'code' | 'review' | 'evidence' }) {
  const steps = [['design', 'Design'], ['code', 'Investigate'], ['review', 'Review & submit'], ['evidence', 'Evaluation']] as const;
  const activeIndex = steps.findIndex(([key]) => key === active);
  return <ol className="workflow-steps" aria-label="Lab workflow">{steps.map(([key, label], index) => <li className={index < activeIndex ? 'done' : index === activeIndex ? 'current' : ''} aria-current={index === activeIndex ? 'step' : undefined} key={key}><span>{String(index + 1).padStart(2, '0')}</span>{label}</li>)}</ol>;
}

function StarterDiagram({ scene }: { scene: 'hld' | 'lld' }) {
  return scene === 'hld' ? <svg viewBox="0 0 460 124" role="img" aria-label="Illustrative HLD: client sends a request to an API, which reads and writes PostgreSQL; a retry returns through the API.">
    <defs><marker id="starter-arrow-hld" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0 0L7 3L0 6" fill="none" stroke="currentColor" /></marker></defs>
    <g fill="var(--surface)" stroke="var(--line)" strokeWidth="2"><rect x="8" y="34" width="112" height="54" rx="8"/><rect x="174" y="34" width="112" height="54" rx="8"/><rect x="340" y="34" width="112" height="54" rx="8"/></g>
    <g fill="var(--ink)" fontSize="13" textAnchor="middle"><text x="64" y="65">Client</text><text x="230" y="65">API</text><text x="396" y="65">PostgreSQL</text></g>
    <g fill="none" stroke="var(--accent)" strokeWidth="2" markerEnd="url(#starter-arrow-hld)"><path d="M120 53H170"/><path d="M286 53H336"/><path d="M340 78H124" strokeDasharray="5 4"/></g>
    <text x="230" y="116" fill="var(--sub)" fontSize="11" textAnchor="middle">Mark where the retry re-enters the request path.</text>
  </svg> : <svg viewBox="0 0 460 142" role="img" aria-label="Illustrative LLD: account and key are reserved inside one transaction, then balance, ledger, operation and response are stored.">
    <defs><marker id="starter-arrow-lld" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0 0L7 3L0 6" fill="none" stroke="currentColor" /></marker></defs>
    <g fill="var(--surface)" stroke="var(--line)" strokeWidth="2"><rect x="8" y="28" width="120" height="58" rx="8"/><rect x="170" y="28" width="120" height="58" rx="8"/><rect x="332" y="28" width="120" height="58" rx="8"/></g>
    <g fill="var(--ink)" fontSize="12" textAnchor="middle"><text x="68" y="51">Account + key</text><text x="68" y="68">payload identity</text><text x="230" y="51">Transaction</text><text x="230" y="68">reserve / conflict</text><text x="392" y="51">Balance + ledger</text><text x="392" y="68">operation + response</text></g>
    <g fill="none" stroke="var(--accent)" strokeWidth="2" markerEnd="url(#starter-arrow-lld)"><path d="M128 57H166"/><path d="M290 57H328"/></g>
    <rect x="160" y="15" width="140" height="84" rx="12" fill="none" stroke="var(--accent)" strokeDasharray="5 4"/>
    <text x="230" y="126" fill="var(--sub)" fontSize="11" textAnchor="middle">Show what commits together and what is replayed.</text>
  </svg>;
}

function SceneGuide({ scene }: { scene: 'hld' | 'lld' }) {
  return <details className="scene-guide"><summary>View an example structure</summary><figure><StarterDiagram scene={scene} /><figcaption>Illustrative guidance only. It is not added to your drawing or saved with your attempt.</figcaption></figure></details>;
}

function SceneLauncher({ scene, id, prompt, count, frozen }: { scene: 'hld' | 'lld'; id: string; prompt: string; count: number; frozen: boolean }) {
  const label = scene === 'hld' ? 'High-level design' : 'Low-level design';
  return <article className="scene-card">
    <Link className="scene-launcher" href={`/lab/attempts/${id}/design/${scene}`} aria-label={`${frozen ? 'View' : count ? 'Continue' : 'Open'} ${label}`}>
      <span className="eyebrow">{scene.toUpperCase()} / {label}</span><div className="diagram-glyph" aria-hidden="true">{scene === 'hld' ? 'Client → API → Database' : 'Key → Transaction → Writes'}</div>
      <h3>{frozen ? `View ${scene.toUpperCase()} drawing` : count ? `Continue ${scene.toUpperCase()} drawing` : `Open ${scene.toUpperCase()} drawing`} <span aria-hidden="true">↗</span></h3>
      <p>{prompt}</p><small>{count ? `${count} drawable elements · ${frozen ? 'saved scene' : 'saved independently'}` : 'Empty scene · nothing has been prefilled'}</small>
    </Link>
    <SceneGuide scene={scene} />
  </article>;
}

function DecisionFields({ artifact, disabled, change }: { artifact: Artifact; disabled: boolean; change: (update: Partial<Artifact>) => void }) {
  const fields = [
    { key: 'keyScope', label: 'Idempotency key scope', help: 'T6 checks whether two accounts can use the same key independently.', options: [['account', 'Per account'], ['global', 'Global']] },
    { key: 'atomicity', label: 'Database write boundary', help: 'T5 injects a failure after the balance update and checks rollback.', options: [['transaction', 'One transaction'], ['separate_writes', 'Separate writes']] },
    { key: 'payloadConflict', label: 'Same key, changed payload', help: 'T4 checks whether a different amount is rejected without writes.', options: [['reject', 'Reject the conflict'], ['replay', 'Replay the original']] },
  ] as const;
  return <fieldset disabled={disabled} className="decisions"><legend>Three design decisions</legend>{fields.map(field => <label className="decision-field" htmlFor={`decision-${field.key}`} key={field.key}><span>{field.label}<small>{field.help}</small></span><select id={`decision-${field.key}`} value={artifact.decisions[field.key] ?? ''} onChange={event => change({ decisions: { ...artifact.decisions, [field.key]: event.target.value || null } })}><option value="">Choose one…</option>{field.options.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>)}</fieldset>;
}

export function AttemptWorkspace({ id, scene }: { id: string; scene?: 'hld' | 'lld' }) {
  const { api, userId } = useApi();
  const { navigate, search } = useRouter();
  const state = useAttempt(id);
  const challenge = useResource(() => api.challenge(), `challenge:${userId}`);
  const [requirements, showRequirements] = useState(false);
  const [review, setReview] = useState(false);
  const [submitError, setSubmitError] = useState<Error>();
  const reviewRef = useRef<HTMLDialogElement>(null);
  const [sceneEpoch, setSceneEpoch] = useState(0);
  const { queue } = state;
  const requestedTab = new URLSearchParams(search).get('tab') ?? 'design';
  const tab = requestedTab === 'code' || requestedTab === 'evidence' ? requestedTab : 'design';
  useEffect(() => { if (review) reviewRef.current?.showModal(); else reviewRef.current?.close(); }, [review]);
  if (state.error) return <main id="main-content" tabIndex={-1} className="page"><ErrorNotice error={state.error} retry={state.reload} /></main>;
  if (!queue || challenge.loading) return <main id="main-content" tabIndex={-1} className="page"><Loading label="Restoring your attempt and challenge…" /></main>;
  if (!challenge.data) return <main id="main-content" tabIndex={-1} className="page"><ErrorNotice error={challenge.error} retry={challenge.reload} /></main>;

  const artifact = queue.local;
  const frozen = queue.server.status !== 'draft' || queue.submitting || queue.submissionUnknown;
  const disabled = frozen || !!state.recovery || queue.state === 'Conflict';
  const change = (update: Partial<Artifact>) => queue.edit({ ...queue.local, ...update });
  const save = () => { void queue.flush().catch(() => {}); };
  const ready = SubmissionReadyArtifactSchema.safeParse(artifact);
  const missing = ready.success ? [] : ready.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message }));
  const submit = async () => { setSubmitError(undefined); try { await queue.submit(); setReview(false); navigate(`/evidence/attempts/${id}`); } catch (error) { setSubmitError(error instanceof Error ? error : new Error('Submission failed.')); } };
  const banners = <>{queue.submissionUnknown && <div className="notice warning"><strong>Submission status is uncertain.</strong><p>Editing is paused. Check this existing attempt before taking another action.</p><button onClick={() => void queue.checkSubmission()}>Check submission status</button></div>}{state.storageError && <div className="notice warning" role="alert">{state.storageError}<RecoveryDownload queue={queue} /></div>}{state.recovery && <div className="notice warning"><strong>A device copy has unsaved work.</strong><p>Server revision {queue.server.revision}; device base revision {state.recovery.baseRevision}. Restore it to compare before writing.</p><div className="actions"><button onClick={state.recover}>Restore device copy</button><button onClick={state.discardRecovery}>Use server draft</button></div></div>}<Conflicts queue={queue} /><ErrorNotice error={queue.error} />{queue.error && <RecoveryDownload queue={queue} />}</>;

  if (scene) {
    const requirementsId = `requirements-${id}-${scene}`;
    return <main id="main-content" tabIndex={-1} className="drawing-page" aria-label={`${scene.toUpperCase()} drawing workspace`}>
      <div className="drawing-toolbar"><Link className="button" href={`/lab/attempts/${id}`}>← Back to lab</Link><div className="segmented" aria-label="Drawing scene"><Link aria-current={scene === 'hld' ? 'page' : undefined} href={`/lab/attempts/${id}/design/hld`}>HLD</Link><Link aria-current={scene === 'lld' ? 'page' : undefined} href={`/lab/attempts/${id}/design/lld`}>LLD</Link></div><SaveStatus queue={queue} /><div className="spacer" /><button aria-expanded={requirements} aria-controls={requirementsId} onClick={() => showRequirements(value => !value)}>{requirements ? 'Hide requirements' : 'Requirements'}</button>{!frozen && <button disabled={disabled || queue.state === 'Saving'} onClick={save}>Save draft</button>}</div>
      {banners}{!disabled && <UnsupportedContent queue={queue} scene={scene} onRemove={() => setSceneEpoch(value => value + 1)} />}
      <aside id={requirementsId} className="drawing-requirements" aria-label="Challenge requirements" hidden={!requirements}><div className="drawer-heading"><div><span className="eyebrow">Drawing brief</span><h2>{scene.toUpperCase()} requirements</h2></div><button onClick={() => showRequirements(false)}>Close</button></div><Requirements challenge={challenge.data} /><SceneGuide scene={scene} /></aside>
      <p className="drawing-hint"><strong>{challenge.data.diagramPrompts[scene]}</strong><span>HLD and LLD save independently. Switch scenes after an edit; autosave keeps the other drawing. {frozen ? 'Submitted artifact is read-only.' : 'Simple shapes only · 200 elements per scene · 1 MiB per save.'}</span></p>
      <div className="drawing-host"><SceneView sceneKey={`${id}:${scene}:${sceneEpoch}`} scene={artifact[scene]} name={`${scene.toUpperCase()} · ${shortId(id)}`} readOnly={disabled} onChange={value => change({ [scene]: value })} /></div>
    </main>;
  }

  return <main id="main-content" tabIndex={-1} className="workspace">
    <div className="attempt-header"><div><span className="eyebrow">Engineering lab · challenge v1 · attempt {shortId(id)}</span><h1 tabIndex={-1}>{challenge.data.title}</h1></div><div className="attempt-state"><Badge>{queue.server.status.replaceAll('_', ' ')}</Badge><SaveStatus queue={queue} /></div></div>
    {banners}<WorkflowSteps active={review ? 'review' : tab} />
    <div className="workspace-tabs" role="navigation" aria-label="Attempt sections">{[['design', '01', 'Design'], ['code', '02', 'Investigate code'], ['evidence', '03', 'Evidence']].map(([value, number, label]) => <Link key={value} href={`/lab/attempts/${id}?tab=${value}`} aria-current={tab === value ? 'page' : undefined}><small>{number}</small> {label}</Link>)}</div>
    <div className="lab-grid"><aside className="requirements"><Requirements challenge={challenge.data} /></aside><section className="lab-work">
      {tab === 'evidence' ? <EvaluationPanel attempt={queue.server} /> : tab === 'code' ? <Investigation attemptId={id} artifact={artifact} challenge={challenge.data} disabled={disabled} change={change} /> : <>
        <div className="section-heading"><div><span className="eyebrow">Step 1 / Design the behavior</span><h2>Show where the request goes and what must commit.</h2></div><Badge>Saved as a human-review artifact</Badge></div>
        <p className="muted design-intro">Draw the client, API and database in HLD. Use LLD to show key reservation, payload conflicts, transaction scope and stored response. Both scenes start empty; example guidance stays outside your work.</p>
        <div className="scene-launchers">{(['hld', 'lld'] as const).map(name => <SceneLauncher key={name} scene={name} id={id} prompt={challenge.data!.diagramPrompts[name]} count={drawableCount(artifact[name])} frozen={frozen} />)}</div>
        <DecisionFields artifact={artifact} disabled={disabled} change={change} />
        <p className="small muted">Add your first-pass reasoning in <Link href={`/lab/attempts/${id}?tab=code`}>Investigate code</Link>. It is stored in the existing notes field and remains part of your submitted artifact.</p>
      </>}
    </section></div>
    <footer className="workspace-footer"><div><SaveStatus queue={queue} /><p className="small muted">{queue.submissionUnknown ? 'Submission status is uncertain. Check the existing attempt above.' : queue.server.status !== 'draft' ? 'Submitted artifacts are immutable. A different repair requires a new attempt.' : 'Edits autosave after a short pause. Review the acknowledged revision before submission.'}</p></div><div className="actions">{frozen ? <><Link className="button primary" href={`/evidence/attempts/${id}`}>View evaluation & evidence →</Link><Link className="button" href="/evidence">My Evidence</Link></> : <><button disabled={disabled || queue.state === 'Saving'} onClick={save}>Save draft</button><button className="primary" disabled={disabled} onClick={() => setReview(true)}>Review submission →</button></>}</div></footer>
    <dialog ref={reviewRef} className="review-sheet" onCancel={() => setReview(false)} onClose={() => setReview(false)} aria-labelledby="review-title"><div className="section-heading"><span className="eyebrow">One immutable submission</span><button aria-label="Close submission review" disabled={queue.submitting} onClick={() => setReview(false)}>×</button></div><h2 id="review-title">Check the artifact before evaluation.</h2><p>The app saves the captured artifact, then submits that acknowledged revision. Diagram presence is checked; design quality and your reasoning require human review.</p><dl><dt>HLD / LLD</dt><dd>{drawableCount(artifact.hld)} / {drawableCount(artifact.lld)} drawable elements</dd><dt>Selected implementation</dt><dd>{variantLabel(artifact.variantId)}</dd><dt>Acknowledged revision</dt><dd>{queue.server.revision}</dd><dt>Design decisions</dt><dd>{Object.values(artifact.decisions).map(value => value ?? 'Unset').join(' · ')}</dd></dl><details><summary>View captured artifact details</summary><pre>{JSON.stringify(artifact, null, 2)}</pre></details>{missing.length > 0 ? <div className="notice warning"><strong>Complete these fields before submitting</strong><ul>{missing.map((issue, index) => <li key={index}>{issue.path}: {issue.message}</li>)}</ul></div> : <p className="notice">Both scenes, decisions and written reasoning are present. The server checks the submitted artifact again.</p>}<ErrorNotice error={submitError} /><div className="actions"><button disabled={queue.submitting} onClick={() => setReview(false)}>Keep editing</button><button className="primary" disabled={missing.length > 0 || queue.submitting} onClick={() => void submit()}>{queue.submitting ? 'Saving and submitting…' : 'Save and submit this artifact'}</button></div></dialog>
  </main>;
}

export function Investigation({ attemptId, artifact, challenge, disabled, change }: { attemptId: string; artifact: Artifact; challenge: ChallengeDto; disabled: boolean; change: (update: Partial<Artifact>) => void }) {
  const [left, setLeft] = useState<VariantId>('credit-first');
  const [right, setRight] = useState<VariantId>('key-only');
  const [fileIndex, setFileIndex] = useState(0);
  const variants = challenge.variants;
  const files = (variant: VariantId) => variants.find(item => item.id === variant)?.files ?? [];
  const maxFiles = Math.max(files(left).length, files(right).length);
  return <>
    <span className="eyebrow">Step 2 / Investigate reviewed source</span><h2>Find where identity and writes meet.</h2>
    <p className="muted">Compare a file at a time. Reading a variant does not select the implementation for evaluation, and no source runs in your browser.</p>
    <div className="investigation-prompts"><strong>Questions to investigate</strong><ul><li>When is the account-scoped key reserved?</li><li>Can a failure after the balance update leave partial effects?</li><li>What should happen when concurrent requests use the same key?</li></ul></div>
    <div className="compare-controls"><label>First implementation<select aria-label="First comparison implementation" value={left} onChange={event => setLeft(event.target.value as VariantId)}>{variants.map(item => <option key={item.id} value={item.id}>{variantLabel(item.id)} · {item.label}</option>)}</select></label><label>Compare with<select aria-label="Second comparison implementation" value={right} onChange={event => setRight(event.target.value as VariantId)}>{variants.map(item => <option key={item.id} value={item.id}>{variantLabel(item.id)} · {item.label}</option>)}</select></label><label>Source file<select aria-label="Source file" value={fileIndex} onChange={event => setFileIndex(Number(event.target.value))}>{Array.from({ length: maxFiles }, (_, index) => <option key={index} value={index}>{files(left)[index]?.path ?? files(right)[index]?.path ?? `File ${index + 1}`}</option>)}</select></label></div>
    <div className="source-comparison">{[left, right].map((variant, side) => { const file = files(variant)[fileIndex]; const lines = (file?.source ?? '').split(/\r?\n/); return <section key={side}><div className="code-heading"><strong>{variantLabel(variant)} · {variant}</strong><span>{file?.path ?? 'No corresponding file'}</span></div><pre tabIndex={0} aria-label={`${side === 0 ? 'First' : 'Second'} source ${variantLabel(variant)} · ${file?.path ?? 'no file'}`}><code>{file ? lines.map((line, index) => <span className="source-line" key={index}><span className="source-line-number" aria-hidden="true">{index + 1}</span><span>{line || ' '}</span></span>) : 'No corresponding file.'}</code></pre></section>; })}</div>
    <label className="field hypothesis-field">Initial hypothesis & investigation notes <span className="muted">Saved in your artifact notes · human review</span><textarea maxLength={4000} disabled={disabled} value={artifact.comments ?? ''} onChange={event => change({ comments: event.target.value })} placeholder="Before choosing a repair, where could the retry apply a second credit? Which disclosed check would help you investigate?" /><small>{artifact.comments?.length ?? 0}/4000</small></label>
    <fieldset className="repair-selector" disabled={disabled}><legend>Select the reviewed implementation you want evaluated</legend><p className="muted small">This is an implementation choice, not a code editor. The selected source is preserved in the challenge record; it is not evidence that you authored it.</p><div className="repair-options">{variants.map(item => <label className={artifact.variantId === item.id ? 'selected' : ''} key={item.id}><input type="radio" name="repair" value={item.id} checked={artifact.variantId === item.id} onChange={() => change({ variantId: item.id })} />{variantLabel(item.id)}<small>{item.label} · {artifact.variantId === item.id ? 'Selected for evaluation' : 'Choose this implementation'}</small></label>)}</div></fieldset>
    <details className="scenario-links"><summary>Which disclosed checks examine these questions?</summary>{challenge.testDescriptions.map(test => <p key={test.id}><strong>{test.id}</strong> · {test.description}</p>)}</details>
    <div className="reasoning-grid"><section><span className="eyebrow">Reviewed prompt · {challenge.faultyAiSuggestion.source}</span><h3>{challenge.faultyAiSuggestion.title}</h3><blockquote>{challenge.faultyAiSuggestion.text}</blockquote><label className="field">Your critique <span className="muted">Saved for human review</span><textarea maxLength={1200} disabled={disabled} value={artifact.aiCritique ?? ''} onChange={event => change({ aiCritique: event.target.value })} placeholder="Which claim needs scrutiny? Describe a failure window and its effect." /><small>{artifact.aiCritique?.length ?? 0}/1200</small></label></section><section><span className="eyebrow">Your engineering judgment</span><h3>Why did you choose this repair?</h3><p>Connect the selected implementation to your design decisions, retry behavior and transaction boundary.</p><label className="field">Repair justification <span className="muted">Self-reported reasoning</span><textarea maxLength={1200} disabled={disabled} value={artifact.repairJustification ?? ''} onChange={event => change({ repairJustification: event.target.value })} placeholder="Explain the behavior you expect and what these tests cannot establish." /><small>{artifact.repairJustification?.length ?? 0}/1200</small></label></section></div>
    <Link className="text-action" href={`/lab/attempts/${attemptId}?tab=design`}>Return to design and check both saved scenes →</Link>
  </>;
}
