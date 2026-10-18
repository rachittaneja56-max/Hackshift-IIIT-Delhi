import { useEffect, useRef, useState } from 'react';
import type { Artifact, ChallengeDto, VariantId } from '@trajectoryos/contracts';
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
import { ApiClientError } from '../lib/api';
import { saveStatusLabel } from '../lib/presentation';
import { serverSubmissionIssues, submissionIssues, submissionIssue, type SubmissionIssue } from './validation';
export const variantLabel = (id: string | null) => id === 'credit-first' ? 'Variant A' : id === 'key-only' ? 'Variant B' : id === 'atomic' ? 'Variant C' : 'Not selected';
export function LabLanding() {
  const { api, userId } = useApi(); const c = useResource(() => api.challenge(), `challenge:${userId}`);
  return <main id="main-content" tabIndex={-1} className="page">
    <PageTitle eyebrow="Engineering lab / 01" title="A request can repeat. Its effect shouldn’t."><p className="lead">Make the retry boundary visible. Investigate the supplied code. Let actual database observations inform your explanation.</p></PageTitle>
    {c.loading ? <Loading /> : c.error ? <ErrorNotice error={c.error} retry={c.reload} /> : c.data && <div className="lab-intro"><section><Badge>Approved implementation investigation</Badge><h2>{c.data.title}</h2><Markdown text={c.data.requirementMarkdown} /><StartAttempt /><Link className="text-action" href="/evidence">Resume a saved attempt →</Link></section><aside className="panel"><span className="eyebrow">What you’ll produce</span><h3>Design. Judgment. Observations.</h3><ol><li>Separate HLD and LLD drawings</li><li>Three explicit design decisions</li><li>A selected repair and your reasoning</li><li>A frozen PostgreSQL evidence record</li></ol><p className="muted">Tests execute reviewed code using synthetic credits. Your drawings and reasoning remain artifacts for human review.</p></aside></div>}
    <section className="panel" style={{ marginTop: '1.5rem' }}><span className="eyebrow">Engineering lab / AI debugging</span><h2>Sandbox interview · rate limiter</h2><p>Work with a limited coding assistant in an isolated sandbox. You get five prompts to investigate a rate limiter, inspect source edits, run visible tests and submit for independent hidden tests.</p><Link className="button" href="/lab/ai-debugging">Start sandbox interview →</Link></section>
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
function SaveStatus({ queue }: { queue: SaveQueue }) {
  const label = saveStatusLabel(queue.state, queue.submitting, queue.submissionUnknown);
  return <div className={`save-status ${queue.state === 'Conflict' || queue.state === 'Offline' ? 'warn' : ''}`} role="status"><span>{label}</span><details><summary>Save details</summary><span>Server revision {queue.server.revision} · {queue.state}</span></details></div>;
}
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
function WorkflowSteps({ active, submitted, canReview, onReview, id }: { active: 'design' | 'code' | 'review' | 'evidence'; submitted: boolean; canReview: boolean; onReview: () => void; id: string }) {
  return <nav className="workflow-steps" aria-label="Attempt workflow">
    <Link className={active === 'design' ? 'current' : ''} aria-current={active === 'design' ? 'step' : undefined} href={`/lab/attempts/${id}?tab=design`}><span>01</span>Design</Link>
    <Link className={active === 'code' ? 'current' : ''} aria-current={active === 'code' ? 'step' : undefined} href={`/lab/attempts/${id}?tab=code`}><span>02</span>Investigate</Link>
    {submitted ? <span className="workflow-step completed"><span>03</span>Submitted</span> : <button type="button" className={active === 'review' ? 'current' : ''} aria-current={active === 'review' ? 'step' : undefined} disabled={!canReview} onClick={onReview}><span>03</span>Review &amp; submit</button>}
    {submitted ? <Link className={active === 'evidence' ? 'current' : ''} aria-current={active === 'evidence' ? 'step' : undefined} href={`/lab/attempts/${id}?tab=evidence`}><span>04</span>Results</Link> : <span className="workflow-step unavailable" aria-disabled="true"><span>04</span>Results</span>}
  </nav>;
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

function SceneLauncher({ scene, id, prompt, count, frozen, invalid, sceneData }: { scene: 'hld' | 'lld'; id: string; prompt: string; count: number; frozen: boolean; invalid: boolean; sceneData: Artifact['hld'] }) {
  const label = scene === 'hld' ? 'High-level design' : 'Low-level design';
  return <article id={`field-${scene}`} tabIndex={-1} aria-invalid={invalid} className={`scene-card ${scene === 'hld' ? 'field-hld' : 'field-lld'} ${invalid ? 'field-invalid' : ''}`}>
    <div className="scene-card-preview">{count && sceneData ? <SceneView sceneKey={`${id}:card:${scene}`} scene={sceneData} name={`Saved ${scene.toUpperCase()} preview`} readOnly /> : <figure><StarterDiagram scene={scene} /><figcaption>Illustrative structure · your drawing starts empty</figcaption></figure>}</div>
    <div className="scene-card-content"><span className="eyebrow">{scene.toUpperCase()} / {label}</span><h3>{frozen ? `View ${scene.toUpperCase()} drawing` : count ? `Continue ${scene.toUpperCase()} drawing` : `Start ${scene.toUpperCase()} drawing`}</h3>
      <p>{prompt}</p><small>{count ? `${count} saved elements` : 'No drawing has been added yet'}</small>
      <Link className="button" href={`/lab/attempts/${id}/design/${scene}`} aria-label={`${frozen ? 'View' : count ? 'Continue' : 'Open'} ${label}`}>{frozen ? 'View drawing' : count ? 'Continue drawing' : 'Open drawing'} <span aria-hidden="true">→</span></Link>
    </div>
  </article>;
}

function DecisionFields({ artifact, disabled, change, invalidPaths }: { artifact: Artifact; disabled: boolean; change: (update: Partial<Artifact>) => void; invalidPaths: string[] }) {
  const fields = [
    { key: 'keyScope', label: 'Which requests share a key?', help: 'Choose whether keys belong to one account or are shared globally.', reference: 'T6 · The same key remains independent across two accounts.', options: [['account', 'Per account'], ['global', 'Global']] },
    { key: 'atomicity', label: 'What commits together?', help: 'Choose whether balance, ledger, operation and replay data form one transaction.', reference: 'T5 · A failure after the balance update rolls back the transaction.', options: [['transaction', 'One transaction'], ['separate_writes', 'Separate writes']] },
    { key: 'payloadConflict', label: 'What if the amount changes?', help: 'Choose what happens when the same account and key arrive with a different amount.', reference: 'T4 · A changed amount with the same account and key is rejected.', options: [['reject', 'Reject the conflict'], ['replay', 'Replay the original']] },
  ] as const;
  return <fieldset disabled={disabled} className="decisions"><legend>Three design decisions</legend>{fields.map(field => <fieldset id={`field-decisions-${field.key}`} tabIndex={-1} className="decision-field" key={field.key} aria-invalid={invalidPaths.includes(`decisions.${field.key}`)}><legend>{field.label}</legend><p>{field.help}</p><div className="decision-options">{field.options.map(([value, label]) => <label key={value}><input type="radio" name={`decision-${field.key}`} value={value} checked={artifact.decisions[field.key] === value} onChange={() => change({ decisions: { ...artifact.decisions, [field.key]: value } })} />{label}</label>)}</div><details><summary>Check reference</summary><p>{field.reference}</p></details></fieldset>)}</fieldset>;
}

export function AttemptWorkspace({ id, scene }: { id: string; scene?: 'hld' | 'lld' }) {
  const { api, userId } = useApi();
  const { navigate, search } = useRouter();
  const state = useAttempt(id);
  const challenge = useResource(() => api.challenge(), `challenge:${userId}`);
  const [requirements, showRequirements] = useState(false);
  const [review, setReview] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [focusTargetId, setFocusTargetId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<Error>();
  const [serverIssues, setServerIssues] = useState<SubmissionIssue[]>([]);
  const reviewRef = useRef<HTMLDialogElement>(null);
  const [sceneEpoch, setSceneEpoch] = useState(0);
  const { queue } = state;
  const requestedTab = new URLSearchParams(search).get('tab') ?? 'design';
  const tab = requestedTab === 'code' || requestedTab === 'evidence' ? requestedTab : 'design';
  useEffect(() => { if (review) reviewRef.current?.showModal(); else reviewRef.current?.close(); }, [review]);
  const currentIssues = queue ? [...submissionIssues(queue.local, queue.server.revision), ...serverIssues] : [];
  const missing = [...new Map(currentIssues.map(issue => [issue.path, issue])).values()];
  useEffect(() => {
    if (review || !showValidation || !focusTargetId) return;
    const issue = missing.find(item => item.targetId === focusTargetId);
    if (!issue) { setFocusTargetId(null); return; }
    const requiredTab = ['hld', 'lld'].includes(issue.path) || issue.path.startsWith('decisions.') ? 'design' : 'code';
    if (tab !== requiredTab) { navigate(`/lab/attempts/${id}?tab=${requiredTab}`); return; }
    const target = document.getElementById(issue.targetId) ?? document.getElementById('submission-errors-title');
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFocusTargetId(null);
  }, [review, showValidation, focusTargetId, missing[0]?.targetId, tab, navigate, id]);
  if (state.error) return <main id="main-content" tabIndex={-1} className="page"><ErrorNotice error={state.error} retry={state.reload} /></main>;
  if (!queue || challenge.loading) return <main id="main-content" tabIndex={-1} className="page"><Loading label="Restoring your attempt and challenge…" /></main>;
  if (!challenge.data) return <main id="main-content" tabIndex={-1} className="page"><ErrorNotice error={challenge.error} retry={challenge.reload} /></main>;

  const artifact = queue.local;
  const frozen = queue.server.status !== 'draft' || queue.submitting || queue.submissionUnknown;
  const disabled = frozen || !!state.recovery || queue.state === 'Conflict';
  const change = (update: Partial<Artifact>) => { setServerIssues([]); setSubmitError(undefined); queue.edit({ ...queue.local, ...update }); };
  const save = () => { void queue.flush().catch(() => {}); };
  const submit = async () => {
    setSubmitError(undefined);
    try { await queue.submit(); setReview(false); navigate(`/evidence/attempts/${id}`); }
    catch (error) {
      if (error instanceof ApiClientError && error.status === 422) {
        const issues = serverSubmissionIssues(error.details?.issues);
        const actionable = issues.length ? issues : [submissionIssue({ path: '', message: error.message })];
        setServerIssues(actionable);
        setFocusTargetId(actionable[0]?.targetId ?? null);
        setShowValidation(true); setReview(false);
        return;
      }
      setSubmitError(error instanceof Error ? error : new Error('Submission failed.'));
    }
  };
  const beginReview = () => {
    setShowValidation(true);
    if (missing.length) { setFocusTargetId(missing[0].targetId); return; }
    setReview(true);
  };
  const focusIssue = (issue: SubmissionIssue) => {
    const requiredTab = ['hld', 'lld'].includes(issue.path) || issue.path.startsWith('decisions.') ? 'design' : 'code';
    if (tab !== requiredTab) {
      setFocusTargetId(issue.targetId);
      navigate(`/lab/attempts/${id}?tab=${requiredTab}`);
      return;
    }
    const target = document.getElementById(issue.targetId) ?? document.getElementById('submission-errors-title');
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
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
    <div className="attempt-header"><div><span className="eyebrow">Architecture &amp; Reliability Lab</span><h1 tabIndex={-1}>{challenge.data.title}</h1><details className="attempt-details"><summary>Attempt details</summary><span>Attempt {shortId(id)} · challenge version {challenge.data.version}</span></details></div><div className="attempt-state"><Badge>{queue.server.status === 'draft' ? 'In progress' : queue.server.status === 'queued' || queue.server.status === 'running' ? 'Evaluating' : queue.server.status === 'execution_error' ? 'Evaluation needs attention' : 'Completed'}</Badge><SaveStatus queue={queue} /></div></div>
    {banners}<WorkflowSteps active={review ? 'review' : tab} submitted={queue.server.status !== 'draft'} canReview={!disabled && queue.state !== 'Saving'} onReview={beginReview} id={id} />
    {showValidation && missing.length > 0 && <div className="notice warning submission-errors" role="alert" aria-labelledby="submission-errors-title"><h2 id="submission-errors-title" tabIndex={-1}>A few details need attention</h2><p>Fix these items, then review your submission again.</p><ul>{missing.map(issue => <li key={issue.path}><a href={`#${issue.targetId}`} onClick={event => { event.preventDefault(); focusIssue(issue); }}>{issue.message}</a></li>)}</ul><details><summary>Advanced: validation details</summary><ul>{missing.map(issue => <li key={issue.path}><code>{issue.path || 'submission'}</code> · {issue.diagnostic}</li>)}</ul></details></div>}
    <div className="lab-grid"><aside className="requirements"><Requirements challenge={challenge.data} /></aside><section className="lab-work">
      {tab === 'evidence' ? <EvaluationPanel attempt={queue.server} /> : tab === 'code' ? <Investigation attemptId={id} artifact={artifact} challenge={challenge.data} disabled={disabled} change={change} invalidPaths={missing.map(issue => issue.path)} /> : <>
        <div className="section-heading"><div><span className="eyebrow">Step 1 / Design the behavior</span><h2>Show where the request goes and what must commit.</h2></div><Badge>Saved as a human-review artifact</Badge></div>
        <p className="muted design-intro">Draw the client, API and database in HLD. Use LLD to show key reservation, payload conflicts, transaction scope and stored response. Both scenes start empty; example guidance stays outside your work.</p>
        <div className="scene-launchers">{(['hld', 'lld'] as const).map(name => <SceneLauncher key={name} scene={name} id={id} prompt={challenge.data!.diagramPrompts[name]} count={drawableCount(artifact[name])} frozen={frozen} invalid={missing.some(issue => issue.path === name)} sceneData={artifact[name]} />)}</div>
        <DecisionFields artifact={artifact} disabled={disabled} change={change} invalidPaths={missing.map(issue => issue.path)} />
        <p className="small muted">Add your first-pass reasoning in <Link href={`/lab/attempts/${id}?tab=code`}>Investigate code</Link>. It is stored in the existing notes field and remains part of your submitted artifact.</p>
      </>}
    </section></div>
    <footer className="workspace-footer"><div><SaveStatus queue={queue} /><p className="small muted">{queue.submissionUnknown ? 'Submission status is uncertain. Check the existing attempt above.' : queue.server.status !== 'draft' ? 'Submitted artifacts are immutable. A different repair requires a new attempt.' : 'Edits autosave after a short pause. Review the acknowledged revision before submission.'}</p></div><div className="actions">{frozen ? <><Link className="button primary" href={`/evidence/attempts/${id}`}>View evaluation & evidence →</Link><Link className="button" href="/evidence">My Evidence</Link></> : <><button disabled={disabled || queue.state === 'Saving'} onClick={save}>Save draft</button><button className="primary" disabled={disabled} onClick={beginReview}>Review submission →</button></>}</div></footer>
    <dialog ref={reviewRef} className="review-sheet" onCancel={() => setReview(false)} onClose={() => setReview(false)} aria-labelledby="review-title"><div className="section-heading"><span className="eyebrow">One immutable submission</span><button aria-label="Close submission review" disabled={queue.submitting} onClick={() => setReview(false)}>×</button></div><h2 id="review-title">Check the artifact before evaluation.</h2><p>The app saves the captured artifact, then submits that acknowledged revision. Diagram presence is checked; design quality and your reasoning require human review.</p><dl><dt>HLD / LLD</dt><dd>{drawableCount(artifact.hld)} / {drawableCount(artifact.lld)} drawable elements</dd><dt>Selected implementation</dt><dd>{variantLabel(artifact.variantId)}</dd><dt>Acknowledged revision</dt><dd>{queue.server.revision}</dd><dt>Design decisions</dt><dd>{Object.values(artifact.decisions).map(value => value ?? 'Unset').join(' · ')}</dd></dl><details><summary>View captured artifact details</summary><pre>{JSON.stringify(artifact, null, 2)}</pre></details>{missing.length > 0 ? <div className="notice warning"><strong>Complete these fields before submitting</strong><ul>{missing.map((issue, index) => <li key={index}>{issue.path}: {issue.message}</li>)}</ul></div> : <p className="notice">Both scenes, decisions and written reasoning are present. The server checks the submitted artifact again.</p>}<ErrorNotice error={submitError} /><div className="actions"><button disabled={queue.submitting} onClick={() => setReview(false)}>Keep editing</button><button className="primary" disabled={missing.length > 0 || queue.submitting} onClick={() => void submit()}>{queue.submitting ? 'Saving and submitting…' : 'Save and submit this artifact'}</button></div></dialog>
  </main>;
}

export function Investigation({ attemptId, artifact, challenge, disabled, change, invalidPaths = [] }: { attemptId: string; artifact: Artifact; challenge: ChallengeDto; disabled: boolean; change: (update: Partial<Artifact>) => void; invalidPaths?: string[] }) {
  const [left, setLeft] = useState<VariantId>('credit-first');
  const [right, setRight] = useState<VariantId>('key-only');
  const [selectedSourceKey, setSelectedSourceKey] = useState('implementation');
  const [search, setSearch] = useState('');
  const [focusedReference, setFocusedReference] = useState<{ variant: VariantId; path: string; line: number } | null>(null);
  const [lineNote, setLineNote] = useState('');
  const [lineNoteError, setLineNoteError] = useState('');
  const variants = challenge.variants;
  const files = (variant: VariantId) => variants.find(item => item.id === variant)?.files ?? [];
  const primaryFile = (variant: VariantId) => files(variant).find(file => file.path.split('/').at(-1) === `${variant}.ts`) ?? files(variant)[0];
  const primaryPaths = new Set([primaryFile(left)?.path, primaryFile(right)?.path]);
  const companionPaths = [...new Set([...files(left), ...files(right)].map(file => file.path))].filter(path => !primaryPaths.has(path));
  const sourceOptions = [
    { key: 'implementation', label: 'Implementation logic', leftFile: primaryFile(left), rightFile: primaryFile(right) },
    ...companionPaths.map(path => ({
      key: path,
      label: path.endsWith('/shared.ts') || path === 'shared.ts' ? 'Shared database helpers'
        : path.endsWith('/types.ts') || path === 'types.ts' ? 'Request and response types'
          : path.split('/').at(-1) ?? path,
      leftFile: files(left).find(file => file.path === path),
      rightFile: files(right).find(file => file.path === path),
    })),
  ];
  const selectedSource = sourceOptions.find(source => source.key === selectedSourceKey) ?? sourceOptions[0];
  const visibleLines = (file: { source: string } | undefined) => (file?.source ?? '').split(/\r?\n/)
    .map((line, index) => ({ line, index }))
    .filter(item => !search || item.line.toLowerCase().includes(search.toLowerCase()));
  const saveLineNote = () => {
    if (!focusedReference || !lineNote.trim()) return;
    const entry = `[${variantLabel(focusedReference.variant)} · ${focusedReference.path}:${focusedReference.line}] ${lineNote.trim()}`;
    const comments = [artifact.comments?.trim(), entry].filter(Boolean).join('\n');
    if (comments.length > 4000) { setLineNoteError('This note would exceed the 4,000 character limit. Shorten it before adding.'); return; }
    change({ comments }); setLineNote(''); setLineNoteError('');
  };
  const testsFor = (ids: string[]) => challenge.testDescriptions.filter(test => ids.includes(test.id));
  return <>
    <header className="investigation-heading"><div><span className="eyebrow">Step 2 / Investigate the reviewed source</span><h2>Trace the retry before choosing a repair.</h2><p className="muted">Start with the implementation files, then compare shared database behavior. Your comparison does not change the implementation selected for evaluation.</p></div><Badge>Evaluation choice · {variantLabel(artifact.variantId)}</Badge></header>
    <section className="investigation-prompts" aria-label="Investigation questions"><h3>What to trace</h3><ol>
      <li><strong>Replay boundary</strong><span>Where does a duplicate request return the original response?</span><small>Disclosed checks · {testsFor(['T2', 'T3']).map(test => test.id).join(' · ') || 'T2 · T3'}</small></li>
      <li><strong>Failure window</strong><span>Can a failure after the balance write leave partial effects?</span><small>Disclosed check · {testsFor(['T5']).map(test => test.id).join(' · ') || 'T5'}</small></li>
      <li><strong>Key identity</strong><span>How do changed amounts and different accounts behave?</span><small>Disclosed checks · {testsFor(['T4', 'T6']).map(test => test.id).join(' · ') || 'T4 · T6'}</small></li>
    </ol></section>
    <div className="compare-controls"><label>First implementation<select aria-label="First comparison implementation" value={left} onChange={event => { setLeft(event.target.value as VariantId); setSelectedSourceKey('implementation'); }} >{variants.map(item => <option key={item.id} value={item.id}>{variantLabel(item.id)} · {item.label}</option>)}</select></label><label>Compare with<select aria-label="Second comparison implementation" value={right} onChange={event => { setRight(event.target.value as VariantId); setSelectedSourceKey('implementation'); }}>{variants.map(item => <option key={item.id} value={item.id}>{variantLabel(item.id)} · {item.label}</option>)}</select></label><label className="source-search">Search selected files<input aria-label="Search source files" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a term or line" /></label></div>
    <nav className="source-file-tree" aria-label="Reviewed source files">{sourceOptions.map(source => <button type="button" key={source.key} aria-current={selectedSource?.key === source.key ? 'page' : undefined} onClick={() => setSelectedSourceKey(source.key)}><span aria-hidden="true">TS</span><span className="source-file-label"><strong>{source.label}</strong><small>{[source.leftFile?.path, source.rightFile?.path].filter(Boolean).join(' ↔ ')}</small></span></button>)}</nav>
    <div className="source-match-count" role="status" aria-live="polite">{search ? `${visibleLines(selectedSource?.leftFile).length} matches in ${variantLabel(left)} · ${visibleLines(selectedSource?.rightFile).length} matches in ${variantLabel(right)}` : `${selectedSource?.label ?? 'Source'} · ${selectedSource?.leftFile?.source.split(/\r?\n/).length ?? 0} / ${selectedSource?.rightFile?.source.split(/\r?\n/).length ?? 0} lines`}</div>
    <div className="source-comparison">{([left, right] as const).map((variant, side) => {
      const file = side === 0 ? selectedSource?.leftFile : selectedSource?.rightFile;
      const lines = visibleLines(file);
      return <section key={side} aria-label={`${variantLabel(variant)} reviewed source`}><div className="code-heading"><strong>{variantLabel(variant)} · {variant}</strong><span>{file?.path ?? 'Not supplied for this variant'}</span></div><pre tabIndex={0} aria-label={`${side === 0 ? 'First' : 'Second'} source ${variantLabel(variant)} · ${file?.path ?? 'no file'}`}><code>{file ? lines.length ? lines.map(({ line, index }) => <span className="source-line" key={index}><button type="button" className="source-line-number" aria-label={`Add a note for ${variantLabel(variant)}, ${file.path}, line ${index + 1}`} aria-pressed={focusedReference?.variant === variant && focusedReference.path === file.path && focusedReference.line === index + 1} onClick={() => { setFocusedReference({ variant, path: file.path, line: index + 1 }); setLineNoteError(''); }}>{index + 1}</button><span>{line || ' '}</span></span>) : `No lines match “${search}”.` : 'This variant does not supply a corresponding file.'}</code></pre></section>;
    })}</div>
    <section className="line-note-panel" aria-labelledby="line-note-heading"><div><span className="eyebrow">Line-level note</span><h3 id="line-note-heading">{focusedReference ? `${variantLabel(focusedReference.variant)} · ${focusedReference.path}:${focusedReference.line}` : 'Select a source line to add a note'}</h3></div><label className="field" htmlFor="focused-line-note">Your note<textarea id="focused-line-note" maxLength={1000} disabled={disabled || !focusedReference} value={lineNote} onChange={event => setLineNote(event.target.value)} placeholder="Record what this line does, or what you want to verify." /></label><div className="actions"><small className="muted">Notes are saved with your investigation notes.</small><button type="button" disabled={disabled || !focusedReference || !lineNote.trim()} onClick={saveLineNote}>Add note</button></div>{lineNoteError && <p className="notice warning" role="alert">{lineNoteError}</p>}</section>
    <label className="field hypothesis-field">Initial hypothesis &amp; investigation notes <span className="muted">Autosaved with this attempt · human review</span><textarea maxLength={4000} disabled={disabled} value={artifact.comments ?? ''} onChange={event => change({ comments: event.target.value })} placeholder="Before choosing a repair, describe where the retry could apply a second credit and what evidence in the source supports your hypothesis." /><small>{artifact.comments?.length ?? 0}/4000</small></label>
    <fieldset id="field-variantId" tabIndex={-1} aria-invalid={invalidPaths.includes('variantId')} className={`repair-selector ${invalidPaths.includes('variantId') ? 'field-invalid' : ''}`} disabled={disabled}><legend>Select the reviewed implementation you want evaluated</legend><p className="muted small">This choice runs the selected reviewed source against the disclosed PostgreSQL checks. It is separate from the side-by-side comparison.</p><div className="repair-options">{variants.map(item => <label className={artifact.variantId === item.id ? 'selected' : ''} key={item.id}><input type="radio" name="repair" value={item.id} checked={artifact.variantId === item.id} onChange={() => change({ variantId: item.id })} />{variantLabel(item.id)}<small>{item.label} · {artifact.variantId === item.id ? 'Selected for evaluation' : 'Choose this implementation'}</small></label>)}</div></fieldset>
    <details className="scenario-links"><summary>Which disclosed checks examine these questions?</summary>{challenge.testDescriptions.map(test => <p key={test.id}><strong>{test.id}</strong> · {test.description}</p>)}</details>
    <div className="reasoning-grid"><section><span className="eyebrow">Reviewed prompt · {challenge.faultyAiSuggestion.source}</span><h3>{challenge.faultyAiSuggestion.title}</h3><blockquote>{challenge.faultyAiSuggestion.text}</blockquote><label className="field" htmlFor="field-aiCritique">Your critique <span className="muted">Saved for human review</span><textarea id="field-aiCritique" aria-invalid={invalidPaths.includes('aiCritique')} maxLength={1200} disabled={disabled} value={artifact.aiCritique ?? ''} onChange={event => change({ aiCritique: event.target.value })} placeholder="Which claim needs scrutiny? Describe a failure window and its effect." /><small>{artifact.aiCritique?.length ?? 0}/1200</small></label></section><section><span className="eyebrow">Your engineering judgment</span><h3>Why did you choose this repair?</h3><p>Connect the selected implementation to your design decisions, retry behavior and transaction boundary.</p><label className="field" htmlFor="field-repairJustification">Repair justification <span className="muted">Self-reported reasoning</span><textarea id="field-repairJustification" aria-invalid={invalidPaths.includes('repairJustification')} maxLength={1200} disabled={disabled} value={artifact.repairJustification ?? ''} onChange={event => change({ repairJustification: event.target.value })} placeholder="Explain the behavior you expect and what these tests cannot establish." /><small>{artifact.repairJustification?.length ?? 0}/1200</small></label></section></div>
    <Link className="text-action" href={`/lab/attempts/${attemptId}?tab=design`}>Return to design and check both saved scenes →</Link>
  </>;
}
