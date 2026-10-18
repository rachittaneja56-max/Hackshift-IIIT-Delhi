import { useEffect, useMemo, useState } from 'react';
import type { AttemptSummary, CareerReviewDto, CreateCareerReview } from '@trajectoryos/contracts';
import { useApi } from '../app/context';
import { Link } from '../app/router';
import { Badge, ErrorNotice, Loading, PageTitle, PreviewNotice, shortId } from '../components/ui';
import { careerApi } from './career-api';
import { sampleJob } from './fixtures';
import { useOwnedSelection } from './selection';
import { testLabel } from '../lib/presentation';

type CareerStage = 'job' | 'evidence' | 'review' | 'resume';
export function CareerSteps({ stage, complete }: { stage: CareerStage; complete: CareerStage[] }) {
  const steps: { id: CareerStage; label: string }[] = [{ id: 'job', label: 'Add a job description' }, { id: 'evidence', label: 'Choose evidence' }, { id: 'review', label: 'Review requirements' }, { id: 'resume', label: 'Edit a résumé draft' }];
  return <ol className="career-steps" aria-label="Career review steps">{steps.map((step, index) => <li key={step.id} className={complete.includes(step.id) ? 'complete' : stage === step.id ? 'current' : ''} aria-current={stage === step.id ? 'step' : undefined}><span>{String(index + 1).padStart(2, '0')}</span>{step.label}</li>)}</ol>;
}

function attemptLabel(item: AttemptSummary) {
  return item.status === 'execution_error' ? 'Execution error' : 'Completed evaluation';
}

function coverageLabel(value: string) {
  return value.replaceAll('_', ' ');
}

export function CareerRelatedChecks({ tests }: { tests: { testId: string; status: string }[] }) {
  return <details className="related-checks"><summary>Related checks ({tests.length})</summary><ul>{tests.map(test => <li key={test.testId}><strong>{test.testId}</strong><span>{testLabel(test.testId)}</span><span className={test.status === 'passed' ? 'pass-text' : 'fail-text'}>{test.status}</span></li>)}</ul></details>;
}

export function CareerPreview() {
  const state = useOwnedSelection({ loadSelectedRecord: false });
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
  const [pollAttempt, setPollAttempt] = useState(0);
  const [copyStatus, setCopyStatus] = useState('');

  const clearReview = () => { setReview(null); setRequestBody(null); setResumeText(''); setError(undefined); setResumeError(undefined); setCopyStatus(''); };
  const sendReview = async (input: CreateCareerReview) => {
    setBusy(true); setError(undefined);
    try { setReview(await career.create(input)); }
    catch (cause) { setError(cause instanceof Error ? cause : new Error('Career review could not be submitted.')); }
    finally { setBusy(false); }
  };
  const toggleEvidence = (id: string) => {
    clearReview();
    setSelectedEvidenceIds(current => current.includes(id) ? current.filter(value => value !== id) : current.length < 10 ? [...current, id] : current);
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
        setError(undefined);
        if (next.status === 'generating') timer = setTimeout(() => void poll(), 1300);
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause : new Error('Career review status is unavailable.'));
      }
    };
    timer = setTimeout(() => void poll(), 1300);
    return () => { alive = false; clearTimeout(timer); };
  }, [career, review?.id, review?.status, userId, pollAttempt]);
  useEffect(() => { if (review?.resumeDraft) setResumeText(review.resumeDraft.markdown); }, [review?.resumeDraft]);

  const makeResume = async () => {
    if (!review) return;
    setResumeBusy(true); setResumeError(undefined); setCopyStatus('');
    try { setReview(await career.resume(review.id)); }
    catch (cause) { setResumeError(cause instanceof Error ? cause : new Error('Résumé draft could not be created.')); }
    finally { setResumeBusy(false); }
  };
  const copyResume = async () => {
    try { await navigator.clipboard.writeText(resumeText); setCopyStatus('Copied the edited draft to your clipboard.'); }
    catch { setCopyStatus('Clipboard access was unavailable. Select the text above and copy it manually.'); }
  };

  const eligible = state.items.filter((item): item is AttemptSummary & { evidenceId: string } => Boolean(item.evidenceId));
  const requirements = review?.analysis?.requirements ?? [];
  const unresolved = requirements.filter(requirement => ['not_observed', 'unassessed', 'self_reported_only'].includes(requirement.coverage));
  const factsCount = factsText.split(/\r?\n/).filter(line => line.trim()).length;
  const jobReady = jobDescription.trim().length > 0;
  const evidenceReady = selectedEvidenceIds.length > 0;
  const analysisReady = Boolean(review?.analysis);
  const resumeReady = Boolean(review?.resumeDraft);
  const stage: CareerStage = resumeReady ? 'resume' : analysisReady || review?.status === 'generating' || (jobReady && evidenceReady) ? 'review' : jobReady ? 'evidence' : 'job';
  const complete: CareerStage[] = [...(jobReady ? ['job' as const] : []), ...(evidenceReady ? ['evidence' as const] : []), ...(analysisReady ? ['review' as const] : []), ...(resumeReady ? ['resume' as const] : [])];
  const inputDisabled = busy || resumeBusy;

  return <main id="main-content" tabIndex={-1} className="page preview-page career-page">
    <PreviewNotice>Private, owner-only analysis · no employer sharing, job search or application API.</PreviewNotice>
    <PageTitle eyebrow="Career / Evidence review" title="Compare a real job description with selected evidence."><p className="lead">Review what your completed test records observed, where a requirement is unassessed, and which statements come only from you.</p></PageTitle>
    <CareerSteps stage={stage} complete={complete} />

    <section className="career-real-review" aria-labelledby="career-input-heading">
      <span className="eyebrow">Steps 1–2 / Candidate-controlled input</span><h2 id="career-input-heading">Choose the role and evidence.</h2>
      <div className="career-input-grid">
        <section className="career-input-section"><span className="career-step-number">01</span><div><h3>Paste a real job description.</h3><label className="field" htmlFor="career-job-description">Job description<textarea id="career-job-description" disabled={inputDisabled} value={jobDescription} maxLength={8000} onChange={event => { clearReview(); setJobDescription(event.target.value); }} placeholder="Paste up to 8,000 characters from a job description." /></label><p className="small muted">When you request analysis, the app sends this text, your selected evidence and optional candidate facts to its configured analysis provider. No employer receives the result.</p></div></section>
        <section className="career-input-section"><span className="career-step-number">02</span><div><h3>Select completed evidence records.</h3><p className="muted">{selectedEvidenceIds.length}/10 records selected. Your selection stays checked as older history loads.</p>
          <fieldset className="career-choices"><legend>Owned records with completed evaluations</legend>
            {state.history.loading ? <Loading label="Loading your attempt history…" /> : state.history.error ? <div className="career-no-evidence"><h4>Attempt history did not load.</h4><p>Retry the history request before deciding whether evidence is available.</p></div> : eligible.length ? eligible.map(item => <label key={item.evidenceId} htmlFor={`career-evidence-${item.evidenceId}`}><input id={`career-evidence-${item.evidenceId}`} type="checkbox" disabled={inputDisabled || (selectedEvidenceIds.length >= 10 && !selectedEvidenceIds.includes(item.evidenceId))} checked={selectedEvidenceIds.includes(item.evidenceId)} onChange={() => toggleEvidence(item.evidenceId)} /><span>Attempt <code>{shortId(item.id)}</code> · evidence <code>{shortId(item.evidenceId)}</code><small>{attemptLabel(item)} · {item.submittedAt ? new Date(item.submittedAt).toLocaleDateString() : 'submission date unavailable'}</small></span><Badge>{item.status}</Badge></label>) : <div className="career-no-evidence"><h4>No completed evidence in this history page.</h4><p>Only completed evaluations create evidence for this review. This page contains {state.items.filter(item => item.status === 'draft').length} draft and {state.items.filter(item => item.status === 'execution_error').length} execution-error record(s); neither contains test observations.</p>{!state.next && <Link className="button" href="/lab">Open the engineering lab →</Link>}</div>}
          </fieldset>
          {state.next && <button disabled={state.busy || inputDisabled} onClick={() => void state.more()}>{state.busy ? 'Loading older history…' : eligible.length ? 'Load older completed evidence' : 'Check older attempts for evidence'}</button>}
          <ErrorNotice error={state.history.error ?? state.error} retry={state.history.error ? state.history.reload : state.more} />
        </div></section>
      </div>
      <label className="field candidate-facts" htmlFor="career-candidate-facts">Optional candidate facts <Badge>Self-reported · unverified</Badge><textarea id="career-candidate-facts" disabled={inputDisabled} value={factsText} maxLength={8000} onChange={event => { clearReview(); setFactsText(event.target.value); }} placeholder="One factual statement per line, such as education, a project or work experience." /></label>
      <p className="small muted">Candidate facts remain separate from observed tests. You can provide up to 30 statements; each is labelled as candidate supplied.</p>
      <div className="career-submit-row"><button className="primary" disabled={inputDisabled || !jobReady || !evidenceReady || selectedEvidenceIds.length > 10 || factsCount > 30} onClick={submitReview}>{busy ? 'Submitting review…' : 'Review requirements and evidence'}</button><span className="small muted">No evidence is sent until you request the review.</span></div>
      {factsCount > 30 && <p role="alert">Provide no more than 30 facts, one per line.</p>}
      {error && <ErrorNotice error={error} />}
      {(error || review?.status === 'unavailable') && requestBody && review?.status !== 'generating' && <button disabled={busy} onClick={retryReview}>{busy ? 'Retrying…' : 'Retry the same review'}</button>}
      {review?.status === 'generating' && <div className="career-generating" role="status"><span className="eyebrow">Step 3 / Analysis in progress</span><p>The server is preparing this evidence-based review. The selected records remain unchanged.</p>{error && <button onClick={() => { setError(undefined); setPollAttempt(value => value + 1); }}>Check review status again</button>}</div>}
    </section>

    {review && <section className="career-packet" aria-live="polite">
      <div className="section-heading"><div><span className="eyebrow">Step 3 / Stored review</span><h2>Requirements and linked observations.</h2></div><Badge tone={review.status === 'unavailable' ? 'fail' : review.status === 'limited' ? 'warning' : ''}>{review.status === 'ready' ? `${review.analysis?.provider ?? 'Model'} · ${review.analysis?.model ?? ''}` : review.status === 'limited' ? 'Deterministic rules · limited' : review.status}</Badge></div>
      {review.status === 'unavailable' && <div className="notice warning"><strong>Analysis unavailable.</strong><p>The request and selected evidence are stored. {review.failureCode ? `Reference: ${review.failureCode}.` : ''} Retry the same request when the provider is available.</p></div>}
      {review.analysis && <>
        <p className="career-source-label">{review.analysis.source === 'llm' ? `Structured analysis via ${review.analysis.provider} · ${review.analysis.model}.` : 'Rules-based text extraction only. No evidence mapping was generated.'}</p>
        {requirements.length ? <div className="table-scroll"><table><thead><tr><th>Requirement from the job description</th><th>Coverage</th><th>Linked observations</th></tr></thead><tbody>{requirements.map(requirement => <tr key={requirement.id}>
          <td><strong>{requirement.text}</strong><p className="small muted">Job-description excerpt: “{requirement.source.excerpt}”</p></td>
          <td><Badge tone={requirement.coverage === 'related_observation' ? 'pass' : requirement.coverage === 'not_observed' ? 'warning' : ''}>{coverageLabel(requirement.coverage)}</Badge>{requirement.candidateFactIds.map(id => <p className="small" key={id}>Candidate-supplied fact {shortId(id)}</p>)}</td>
          <td>{requirement.evidence.length ? requirement.evidence.map(reference => <div className="career-evidence-link" key={reference.evidenceId}><Link href={`/evidence/attempts/${review.evidence.find(record => record.evidenceId === reference.evidenceId)?.attemptId ?? ''}`}>Evidence {shortId(reference.evidenceId)}</Link><p>{reference.tests.map(test => <span key={test.testId} className={test.status === 'passed' ? 'pass-text' : 'fail-text'}><strong>{test.testId}</strong>: {testLabel(test.testId)} ({test.status}) </span>)}</p><small>{reference.explanation}</small></div>) : <span className="muted">No test reference supplied.</span>}</td>
        </tr>)}</tbody></table></div> : <p>No explicit requirements were extracted.</p>}
        <section className="unresolved-requirements"><h3>Not observed, self-reported or unassessed</h3>{unresolved.length ? <ul>{unresolved.map(requirement => <li key={requirement.id}><Badge>{coverageLabel(requirement.coverage)}</Badge><span>{requirement.text}</span></li>)}</ul> : <p>All extracted items were linked to related observations. This does not establish overall role qualification.</p>}</section>
        <section className="career-evidence-records"><h3>Selected evidence · returned test outcomes</h3>{review.evidence.map(record => <article className="included-run" key={record.evidenceId}>
          <div className="section-heading"><h4>Attempt {shortId(record.attemptId)} · evidence {shortId(record.evidenceId)}</h4><Badge>Reviewed variant · {record.variantId}</Badge></div>
          <CareerRelatedChecks tests={record.tests} />
          <p className="hash small">Artifact {record.provenance.artifactSha256} · recorded {new Date(record.createdAt).toLocaleString()}</p>
          <details><summary>Evidence provenance</summary><dl className="provenance-data"><div><dt>Runner</dt><dd>{record.provenance.runnerKind}</dd></div><div><dt>Challenge</dt><dd>{record.provenance.challenge.slug} v{record.provenance.challenge.version}</dd></div><div><dt>Content / manifest</dt><dd>{record.provenance.contentSha256} / {record.provenance.manifestSha256}</dd></div><div><dt>Suite</dt><dd>{record.provenance.suiteVersion} · {record.provenance.suiteSha256}</dd></div><div><dt>Implementation</dt><dd>{record.provenance.implementationSha256}</dd></div><div><dt>App commit</dt><dd>{record.provenance.appCommit}</dd></div><div><dt>Database</dt><dd>{record.provenance.databaseVersion}</dd></div><div><dt>Run</dt><dd>{record.provenance.runId} · generation {record.provenance.generation}</dd></div><div><dt>Run times</dt><dd>{record.provenance.startedAt} — {record.provenance.finishedAt}</dd></div></dl></details>
          <details><summary>Limits for this record</summary><ul>{record.limitations.map((line, index) => <li key={index}>{line}</li>)}</ul></details>
        </article>)}</section>
        <section className="analysis-limitations"><h3>How to read this review</h3><p>Observed tests describe the reviewed implementation. Candidate facts are unverified. AI interpretations are not a qualification, competence or hiring assessment. The model did not grade the diagrams or written reasoning.</p><ul>{review.analysis.limitations.map((line, index) => <li key={index}>{line}</li>)}</ul></section>
        {review.status !== 'generating' && <section className="resume-editor"><div className="section-heading"><div><span className="eyebrow">Step 4 / Optional résumé draft</span><h3>Prepare source-labelled text.</h3></div><button disabled={resumeBusy || !['ready', 'limited'].includes(review.status)} onClick={() => void makeResume()}>{resumeBusy ? 'Preparing…' : review.resumeDraft ? 'Reload generated draft' : 'Generate a draft'}</button></div>
          {resumeError && <ErrorNotice error={resumeError} retry={() => void makeResume()} />}
          {review.resumeDraft && <><Badge>Deterministic template · needs your review</Badge><label className="field" htmlFor="career-resume-draft">Editable résumé draft<textarea id="career-resume-draft" className="resume-draft" value={resumeText} onChange={event => { setResumeText(event.target.value); setCopyStatus(''); }} /></label><p className="small muted">The server keeps the generated source-labelled version. Edits in this box stay in this tab; they do not update the stored review.</p><div className="actions"><button onClick={() => void copyResume()}>Copy edited draft</button>{copyStatus && <span role="status" className="small muted">{copyStatus}</span>}</div></>}
        </section>}
      </>}
    </section>}

    <details className="career-sample-preview"><summary>Open a fictional sample job description</summary><div className="notice"><Badge>Seeded example · local preview only · not submitted</Badge><h3>{sampleJob.title}</h3><p>{sampleJob.description}</p><h4>Illustrative requirements</h4><ul>{sampleJob.requirements.map(requirement => <li key={requirement.id}>{requirement.text} · sample references {requirement.tests.join(', ')}</li>)}</ul><h4>Not assessed in this sample</h4><ul>{sampleJob.notAssessed.map(text => <li key={text}>{text}</li>)}</ul></div></details>
    <p className="planned-note">Reviews stay private to your account. No ATS score, hiring probability, job search, employer account or application action is provided.</p>
  </main>;
}
