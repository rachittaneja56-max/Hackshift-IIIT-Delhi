import { useEffect, useMemo, useState } from 'react';
import type { AttemptSummary, CareerReviewDto, CreateCareerReview } from '@trajectoryos/contracts';
import { useApi, useResource } from '../app/context';
import { Link, useRouter } from '../app/router';
import { Badge, Empty, ErrorNotice, Loading, PageTitle, PreviewNotice, shortId } from '../components/ui';
import { SceneView } from '../drawing/Scene';
import { mentor, sampleJob } from './fixtures';
import { mentorPacket } from './model';
import { careerApi } from './career-api';
function useOwnedSelection() {
  const { api, userId } = useApi(); const router = useRouter(); const selected = new URLSearchParams(router.search).get('attempt') ?? '';
  const history = useResource(() => api.history(), `${userId}:preview-history`); const [older, setOlder] = useState<AttemptSummary[]>([]); const [cursor, setCursor] = useState<string | null | undefined>(); const [busy, setBusy] = useState(false); const [error, setError] = useState<Error>();
  const next = cursor === undefined ? history.data?.nextCursor : cursor;
  const record = useResource(async () => { if (!selected) return null; const attempt = await api.attempt(selected); const evidence = attempt.evidenceId ? await api.evidence(attempt.evidenceId) : null; return { attempt, evidence }; }, `${userId}:preview:${selected}`);
  const more = async () => { if (!next || busy) return; setBusy(true); try { const page = await api.history(next); setOlder(v => [...v, ...page.items]); setCursor(page.nextCursor); setError(undefined); } catch (e) { setError(e instanceof Error ? e : new Error('History unavailable.')); } finally { setBusy(false); } };
  return { selected, history, record, items: [...(history.data?.items ?? []), ...older], next, busy, error, more, select: (id: string) => router.navigate(`${router.path}${id ? `?attempt=${encodeURIComponent(id)}` : ''}`) };
}
function RecordSelector({ state }: { state: ReturnType<typeof useOwnedSelection> }) {
  return <div className="record-selector"><label>Context from your saved work<select value={state.selected} onChange={e => state.select(e.target.value)}><option value="">Choose an owned attempt…</option>{state.selected && !state.items.some(i => i.id === state.selected) && <option value={state.selected}>Selected {shortId(state.selected)} · authorizing on read</option>}{state.items.map(i => <option key={i.id} value={i.id}>{shortId(i.id)} · {i.status} · challenge v{i.challenge.version}</option>)}</select></label>{state.next && <button disabled={state.busy} onClick={() => void state.more()}>Load older choices</button>}<ErrorNotice error={state.history.error ?? state.error} retry={state.history.reload} /></div>;
}
export function MentorPreview() {
  const state = useOwnedSelection(); const [selected, setSelected] = useState<string[]>([]), [question, setQuestion] = useState(''), [example, setExample] = useState(false);
  useEffect(() => { setSelected([]); setQuestion(''); setExample(false); }, [state.selected]);
  const data = state.record.data, artifact = data?.evidence?.artifact ?? data?.attempt.artifact;
  const toggle = (id: string) => setSelected(v => v.includes(id) ? v.filter(i => i !== id) : [...v, id]);
  const packet = data ? mentorPacket(data.attempt, data.evidence, selected, question) : null;
  return <main id="main-content" tabIndex={-1} className="page preview-page"><PreviewNotice /><PageTitle eyebrow="Mentors / Preview" title="Bring a focused question. Bring its context."><p className="lead">Decide which parts of your work a reviewer should see. The packet contains exactly your selection.</p></PageTitle><div className="mentor-profile"><div className="avatar" aria-hidden="true">MS</div><div><h2>{mentor.name}</h2><p>{mentor.focus} · <strong>Fictional mentor persona</strong></p></div><Badge>No live mentor or messaging</Badge></div><RecordSelector state={state} />{state.selected && state.record.loading ? <Loading label="Authorizing and loading the selected attempt…" /> : state.record.error ? <ErrorNotice error={state.record.error} retry={state.record.reload} /> : !data ? <Empty title="Choose your own context."><p>No work is preselected. Only your authenticated saved attempts can populate a packet.</p><Link href="/evidence">View your history →</Link></Empty> : <div className="preview-columns"><section><span className="eyebrow">01 / Choose the context</span><h2>Make the question reviewable.</h2><p className="muted">Attempt {shortId(data.attempt.id)} · {data.evidence ? 'Frozen evidence snapshot' : 'Saved draft; no evaluation observations'}</p><fieldset className="context-checks"><legend>Artifacts & reasoning · start unchecked</legend>{[['hld', 'High-level design'], ['lld', 'Low-level design'], ['aiCritique', 'AI suggestion critique'], ['repairJustification', 'Repair justification'], ['comments', 'Design notes']].map(([key, label]) => <label key={key}><input type="checkbox" checked={selected.includes(key)} onChange={() => toggle(key)} />{label}</label>)}</fieldset><fieldset className="context-checks"><legend>Recorded test observations</legend>{data.evidence ? data.evidence.result.tests.map(t => <label key={t.id}><input type="checkbox" checked={selected.includes(t.id)} onChange={() => toggle(t.id)} /><strong>{t.id}</strong> <span className={t.status === 'passed' ? 'pass-text' : 'fail-text'}>{t.status}</span></label>) : <p>No evaluation evidence exists for this saved attempt.</p>}</fieldset><label className="field">Your focused question<textarea value={question} maxLength={2000} onChange={e => setQuestion(e.target.value)} placeholder="Which boundary or observation would you like help understanding?" /></label></section><section className="mentor-packet"><span className="eyebrow">02 / Mentor-side packet preview</span><h2>Only what you selected.</h2><Badge>Private local preparation · nothing sent</Badge><pre className="packet-json">{JSON.stringify(packet, null, 2)}</pre>{(['hld', 'lld'] as const).filter(k => selected.includes(k) && artifact?.[k]).map(k => <div className="snapshot-viewer" key={k}><SceneView sceneKey={`${data.attempt.id}:packet:${k}`} scene={artifact![k]} name={`Selected ${k}`} readOnly /></div>)}<button onClick={() => setExample(v => !v)} aria-expanded={example}>{example ? 'Hide' : 'View'} seeded example response</button>{example && <div className="notice"><Badge>Seeded example — no live mentor</Badge><p>{mentor.seededResponse}</p></div>}</section></div>}<p className="planned-note">Live mentor discovery, messaging, booking and availability are planned.</p></main>;
}
export function CareerPreview() {
  const state = useOwnedSelection();
  const { api, userId } = useApi();
  const career = useMemo(() => careerApi(api), [api]);
  const [selectedEvidenceIds, setSelectedEvidenceIds] = useState<string[]>([]);
  const [jobDescription, setJobDescription] = useState('');
  const [factsText, setFactsText] = useState('');
  const [review, setReview] = useState<CareerReviewDto | null>(null);
  const [requestBody, setRequestBody] = useState<CreateCareerReview | null>(null);
  const [resumeText, setResumeText] = useState('');
  const [busy, setBusy] = useState(false);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [error, setError] = useState<Error>();
  const [resumeError, setResumeError] = useState<Error>();
  const clearReview = () => { setReview(null); setRequestBody(null); setResumeText(''); setError(undefined); setResumeError(undefined); };
  const sendReview = async (input: CreateCareerReview) => {
    setBusy(true); setError(undefined);
    try { setReview(await career.create(input)); }
    catch (e) { setError(e instanceof Error ? e : new Error('Career review could not be submitted.')); }
    finally { setBusy(false); }
  };
  const toggleEvidence = (id: string) => {
    clearReview();
    setSelectedEvidenceIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  };
  const submitReview = () => {
    const facts = factsText.split(/\r?\n/).map(text => text.trim()).filter(Boolean).slice(0, 30);
    const input: CreateCareerReview = {
      clientRequestId: crypto.randomUUID(),
      jobDescription: jobDescription.trim(),
      evidenceIds: selectedEvidenceIds,
      ...(facts.length ? { candidateFacts: { source: 'candidate_self_reported', items: facts.map(text => ({ id: crypto.randomUUID(), kind: 'other' as const, text })) } } : {}),
    };
    setRequestBody(input);
    void sendReview(input);
  };
  const retryReview = () => { if (requestBody) void sendReview(requestBody); };
  useEffect(() => {
    if (!review || review.status !== 'generating') return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await career.get(review.id);
        if (!alive) return;
        setReview(next);
        if (next.status === 'generating') timer = setTimeout(() => void poll(), 1300);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e : new Error('Career review status is unavailable.'));
      }
    };
    timer = setTimeout(() => void poll(), 1300);
    return () => { alive = false; clearTimeout(timer); };
  }, [career, review?.id, review?.status, userId]);
  useEffect(() => { if (review?.resumeDraft) setResumeText(review.resumeDraft.markdown); }, [review?.resumeDraft]);
  const makeResume = async () => {
    if (!review) return;
    setResumeBusy(true); setResumeError(undefined);
    try { setReview(await career.resume(review.id)); }
    catch (e) { setResumeError(e instanceof Error ? e : new Error('Résumé draft could not be created.')); }
    finally { setResumeBusy(false); }
  };
  const requirements = review?.analysis?.requirements ?? [];
  const unresolved = requirements.filter(requirement => ['not_observed', 'unassessed', 'self_reported_only'].includes(requirement.coverage));
  const factsCount = factsText.split(/\r?\n/).filter(line => line.trim()).length;
  return <main id="main-content" tabIndex={-1} className="page preview-page">
    <PreviewNotice>Private, owner-only analysis · no employer sharing, job search or application API.</PreviewNotice>
    <PageTitle eyebrow="Career / Evidence review" title="Compare a role description with evidence you selected."><p className="lead">The review reports the test observations in your records. It cannot establish authorship, grade your diagrams or make a hiring judgment.</p></PageTitle>
    <section className="career-real-review">
      <span className="eyebrow">01 / Candidate-controlled inputs</span><h2>Choose the job description and evidence.</h2>
      <label className="field">Job description<textarea value={jobDescription} maxLength={8000} onChange={event => { clearReview(); setJobDescription(event.target.value); }} placeholder="Paste up to 8,000 characters from a job description." /></label>
      <p className="small muted">The text is treated as untrusted data. It is private to your account and is used only for this requested analysis.</p>
      <fieldset className="career-choices"><legend>Completed evidence records · select at least one</legend>
        {state.history.loading ? <Loading label="Loading your owned records…" /> : state.items.filter(item => item.evidenceId).length ? state.items.filter(item => item.evidenceId).map(item => <label key={item.id}>
          <input type="checkbox" checked={selectedEvidenceIds.includes(item.evidenceId!)} onChange={() => toggleEvidence(item.evidenceId!)} />
          <span>Attempt <code>{shortId(item.id)}</code> · evidence <code>{shortId(item.evidenceId!)}</code></span><Badge>{item.status}</Badge>
        </label>) : <p>No completed evidence is available in the current history page. Finish a prepared lab, then return here.</p>}
      </fieldset>
      {state.next && <button disabled={state.busy} onClick={() => void state.more()}>Load older evidence</button>}
      <ErrorNotice error={state.history.error ?? state.error} retry={state.history.reload} />
      <label className="field">Optional candidate facts <Badge>Self-reported · unverified</Badge><textarea value={factsText} maxLength={8000} onChange={event => { clearReview(); setFactsText(event.target.value); }} placeholder="One factual statement per line, such as education, project, or experience details." /></label>
      <p className="small muted">Each line will be labelled as candidate-supplied and will not be treated as an observed test result.</p>
      <button disabled={busy || !jobDescription.trim() || !selectedEvidenceIds.length || selectedEvidenceIds.length > 10 || factsCount > 30} onClick={submitReview}>{busy ? 'Submitting…' : 'Review this job description'}</button>
      {selectedEvidenceIds.length > 10 && <p role="alert">Select up to ten evidence records.</p>}{factsCount > 30 && <p role="alert">Provide no more than 30 facts, one per line.</p>}
      {error && <ErrorNotice error={error} />}
      {(error || review?.status === 'unavailable') && requestBody && <button disabled={busy} onClick={retryReview}>{busy ? 'Retrying…' : 'Retry the same review'}</button>}
      {review?.status === 'generating' && <p role="status">Analysis is still running. This page will refresh its status.</p>}
    </section>
    {review && <section className="career-packet" aria-live="polite">
      <div className="section-heading"><div><span className="eyebrow">02 / Stored review</span><h2>Requirements and selected observations</h2></div>
        <Badge>{review.status === 'ready' ? `${review.analysis?.provider ?? 'Model'} · ${review.analysis?.model ?? ''}` : review.status === 'limited' ? 'Deterministic rules · limited' : review.status}</Badge>
      </div>
      {review.status === 'unavailable' && <div className="notice warning"><strong>Analysis unavailable.</strong><p>The request and evidence selection are saved. {review.failureCode ? `Reference: ${review.failureCode}.` : ''} Retry the same review when the provider is available.</p></div>}
      {review.analysis && <>
        <p className="small muted">{review.analysis.source === 'llm' ? `Live structured analysis via ${review.analysis.provider} · ${review.analysis.model}.` : 'Deterministic text extraction only. Requirements remain unassessed; no evidence mapping was generated.'}</p>
        {requirements.length ? <div className="table-scroll"><table><thead><tr><th>Requirement and JD source</th><th>Coverage</th><th>Evidence references</th></tr></thead><tbody>{requirements.map(requirement => <tr key={requirement.id}>
          <td><strong>{requirement.text}</strong><p className="small muted">JD quote: “{requirement.source.excerpt}”</p></td><td><Badge>{requirement.coverage.replaceAll('_', ' ')}</Badge>{requirement.candidateFactIds.map(id => <p className="small" key={id}>Self-reported fact {shortId(id)}</p>)}</td>
          <td>{requirement.evidence.length ? requirement.evidence.map(reference => <div key={reference.evidenceId}><Link href={`/evidence/attempts/${review.evidence.find(record => record.evidenceId === reference.evidenceId)?.attemptId ?? ''}`}>Evidence {shortId(reference.evidenceId)}</Link><p>{reference.tests.map(test => <span key={test.testId} className={test.status === 'passed' ? 'pass-text' : 'fail-text'}>{test.testId}: {test.status} </span>)}</p><small>{reference.explanation}</small></div>) : <span className="muted">No test reference supplied.</span>}</td>
        </tr>)}</tbody></table></div> : <p>No explicit requirements were extracted.</p>}
        <h3>Unobserved, self-reported, or unassessed requirements</h3>{unresolved.length ? <ul>{unresolved.map(requirement => <li key={requirement.id}><strong>{requirement.coverage.replaceAll('_', ' ')}:</strong> {requirement.text}</li>)}</ul> : <p>None were labelled in this analysis.</p>}
        <h3>Selected evidence · actual returned test outcomes</h3>{review.evidence.map(record => <article className="included-run" key={record.evidenceId}>
          <div className="section-heading"><h4>Attempt {shortId(record.attemptId)} · evidence {shortId(record.evidenceId)}</h4><Badge>Reviewed variant · {record.variantId}</Badge></div>
          <div className="run-summary">{record.tests.map(test => <span key={test.testId} className={test.status === 'passed' ? 'pass-text' : 'fail-text'}>{test.testId} {test.status}</span>)}</div>
          <p className="hash small">Artifact {record.provenance.artifactSha256} · recorded {new Date(record.createdAt).toLocaleString()}</p>
          <details><summary>Evidence provenance</summary><dl className="provenance-data"><div><dt>Runner</dt><dd>{record.provenance.runnerKind}</dd></div><div><dt>Challenge</dt><dd>{record.provenance.challenge.slug} v{record.provenance.challenge.version}</dd></div><div><dt>Content / manifest</dt><dd>{record.provenance.contentSha256} / {record.provenance.manifestSha256}</dd></div><div><dt>Suite</dt><dd>{record.provenance.suiteVersion} · {record.provenance.suiteSha256}</dd></div><div><dt>Implementation</dt><dd>{record.provenance.implementationSha256}</dd></div><div><dt>App commit</dt><dd>{record.provenance.appCommit}</dd></div><div><dt>Database</dt><dd>{record.provenance.databaseVersion}</dd></div><div><dt>Run</dt><dd>{record.provenance.runId} · generation {record.provenance.generation}</dd></div><div><dt>Run times</dt><dd>{record.provenance.startedAt} — {record.provenance.finishedAt}</dd></div></dl></details>
          <ul>{record.limitations.map((line, index) => <li key={index}>{line}</li>)}</ul>
        </article>)}
        <h3>Analysis limitations</h3><ul>{review.analysis.limitations.map((line, index) => <li key={index}>{line}</li>)}</ul>
        {review.status !== 'generating' && <><div className="section-heading"><h3>Optional editable résumé draft</h3><button disabled={resumeBusy || !['ready', 'limited'].includes(review.status)} onClick={() => void makeResume()}>{resumeBusy ? 'Preparing…' : review.resumeDraft ? 'Reload saved draft' : 'Prepare source-labelled draft'}</button></div>
          {resumeError && <ErrorNotice error={resumeError} retry={() => void makeResume()} />}
          {review.resumeDraft && <><Badge>Deterministic template · needs your review</Badge><label className="field">Editable Markdown<textarea className="resume-draft" value={resumeText} onChange={event => setResumeText(event.target.value)} /></label><p className="small muted">Source labels distinguish self-reported facts from test observations. Editing stays in this page and is not sent to an employer.</p></>}
        </>}
      </>}
    </section>}
    <details className="career-sample-preview"><summary>Fictional sample JD · local preview only</summary><div className="notice"><Badge>Seeded example · not a live role and not analyzed by the backend</Badge><h3>{sampleJob.title}</h3><p>{sampleJob.description}</p><h4>Illustrative requirements</h4><ul>{sampleJob.requirements.map(requirement => <li key={requirement.id}>{requirement.text} · example references {requirement.tests.join(', ')}</li>)}</ul><h4>Not assessed in the sample</h4><ul>{sampleJob.notAssessed.map(text => <li key={text}>{text}</li>)}</ul></div></details>
    <p className="planned-note">Reviews remain private. No ATS score, hiring probability, job search, employer account or application action is provided.</p>
  </main>;
}
