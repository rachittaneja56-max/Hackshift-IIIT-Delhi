import { useEffect, useRef, useState, type ReactNode } from 'react';
import { candidateIds, exampleLabel, getArtifacts, getCandidate, job, mentor, type CandidateId, type DemoArtifact } from './fixtures';
import { employerApplication, exampleResponse, isShortlisted, loadDemoState, mentorPacket, requirementMapping, saveDemoState, transition, type DemoAction, type DemoState } from './model';
import './demo.css';

type Persona = 'Candidate' | 'Employer' | 'Mentor';
type Send = (action: DemoAction, message: string) => boolean;
const now = () => new Date().toISOString();
function browserStorage() { try { return typeof window === 'undefined' ? undefined : window.localStorage; } catch { return undefined; } }
function Tag({ children, tone = '' }: { children: ReactNode; tone?: string }) { return <span className={`dj-tag ${tone}`}>{children}</span>; }
function Empty({ title, children }: { title: string; children: ReactNode }) { return <div className="dj-empty"><h3>{title}</h3>{children}</div>; }

function Confirmation({ title, children, confirm, close, label }: { title: string; children: ReactNode; confirm: () => void; close: () => void; label: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.showModal();
    return () => { if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  return <dialog className="dj-dialog" ref={ref} aria-labelledby="dj-confirm-title" onCancel={event => { event.preventDefault(); close(); }}>
    <span className="dj-kicker">Human demo action</span><h2 id="dj-confirm-title">{title}</h2>{children}
    <div className="dj-actions"><button type="button" autoFocus onClick={close}>Cancel</button><button className="dj-primary" type="button" onClick={confirm}>{label}</button></div>
  </dialog>;
}

export function EvidenceMaterials({ artifacts, empty = 'No materials selected.' }: { artifacts: DemoArtifact[]; empty?: string }) {
  if (!artifacts.length) return <p className="dj-muted">{empty}</p>;
  return <div className="dj-materials">{artifacts.map(item => <article className="dj-material" key={item.id}>
    <div className="dj-heading"><h4>{item.label}</h4><Tag>{item.source}</Tag></div>
    <p>{item.content}</p>
    {(item.kind === 'hld' || item.kind === 'lld') && <div className="dj-diagram" aria-label={`${item.label}: representative summary`}><span>{item.kind === 'hld' ? 'Client' : 'Key reservation'}</span><b aria-hidden="true">→</b><span>{item.kind === 'hld' ? 'Credit API' : 'Transaction'}</span><b aria-hidden="true">→</b><span>{item.kind === 'hld' ? 'PostgreSQL' : 'Stored response'}</span></div>}
    {!!item.checks.length && <details><summary>Inspect {item.checks.length} exact synthetic observation{item.checks.length === 1 ? '' : 's'}</summary><ul className="dj-checks">{item.checks.map(check => <li key={check.id}><div className="dj-heading"><strong>{check.id} · {check.label}</strong><Tag tone={check.status === 'failed' ? 'dj-warning' : 'dj-positive'}>{check.status} · synthetic</Tag></div><p><b>Expected:</b> {check.expected}</p><p><b>Observed:</b> {check.observed}</p></li>)}</ul></details>}
    <small>Fixture reference: {item.id} · Fictional demo · meta.isMock: true</small>
  </article>)}</div>;
}
function EvidencePicker({ selected, change, prefix, mentorOnly = false }: { selected: string[]; change: (ids: string[]) => void; prefix: string; mentorOnly?: boolean }) {
  return <fieldset className="dj-picker"><legend>Choose exact materials · initially nothing shared</legend>{getCandidate('ananya').artifacts.filter(item => !mentorOnly || ['hld', 'lld', 'tests', 'reasoning'].includes(item.kind)).map(item => <div className="dj-pick-row" key={item.id}><label htmlFor={`${prefix}-${item.id}`}>
    <input type="checkbox" id={`${prefix}-${item.id}`} checked={selected.includes(item.id)} onChange={() => change(selected.includes(item.id) ? selected.filter(id => id !== item.id) : [...selected, item.id])} />
    <span><strong>{item.label}</strong><small>{item.source}</small></span>
    </label><details><summary>Inspect</summary><p>{item.content}</p></details>
  </div>)}</fieldset>;
}
export function JobPosting({ compact = false }: { compact?: boolean }) {
  return <div className="dj-posting"><span className="dj-kicker">{job.company}</span><h2>{job.title}</h2><p className="dj-muted">{job.arrangement}</p><p>{job.description}</p>
    <div className="dj-tags">{job.topics.map(topic => <Tag key={topic}>{topic}</Tag>)}</div>
    {!compact && <><h3>What you would work on</h3><ul>{job.responsibilities.map(text => <li key={text}>{text}</li>)}</ul><h3>What we would discuss</h3><ul>{job.requirements.map(item => <li key={item.id}>{item.text}</li>)}</ul></>}
    <p className="dj-footnote">Fictional posting. No real vacancy, employer account or external application.</p>
  </div>;
}
export function CandidateApplicationView({ state, send, switchPersona }: { state: DemoState; send: Send; switchPersona: (value: Persona) => void }) {
  const app = state.applications.ananya;
  const [selected, setSelected] = useState(app.selected);
  const [opened, setOpened] = useState(app.status !== 'not_started');
  const prepared = app.status === 'prepared' && selected.length === app.selected.length && selected.every(id => app.selected.includes(id));
  if (state.job === 'draft') return <section className="dj-card dj-board"><span className="dj-kicker">Opportunity board / demo</span><h2>A posting starts with the employer.</h2><p>Publish Northstar’s one fictional backend role, then return here as Ananya to choose what to share.</p><button className="dj-primary" onClick={() => switchPersona('Employer')}>Open employer workspace</button><p className="dj-footnote">No live job feed is connected. Kabir and Meera have labelled, pre-seeded application packets for comparison.</p></section>;
  return <div className="dj-columns"><section className="dj-card dj-job"><div className="dj-heading"><Tag tone="dj-positive">Published to demo board</Tag><Tag>Fictional demo</Tag></div><JobPosting compact={!opened} /><button aria-expanded={opened} onClick={() => setOpened(value => !value)}>{opened ? 'Collapse posting' : 'Open job & requirements'}</button></section>
    <section className="dj-card"><div className="dj-heading"><div><span className="dj-kicker">Ananya Mehta / fictional candidate</span><h2>Your application package</h2></div><Tag>{app.status === 'submitted_demo' ? 'Submitted locally' : prepared ? 'Prepared' : 'Choose evidence'}</Tag></div>
      <p>The employer will see your fictional name and only the materials in your confirmed package. Selection grants no real access.</p>
      {app.status === 'submitted_demo' ? <><div className="dj-notice"><strong>Demo application recorded locally.</strong><p>Not externally sent. Saved {app.submittedAt}.</p></div><EvidenceMaterials artifacts={getArtifacts('ananya', app.selected)} /><button className="dj-primary" onClick={() => switchPersona('Employer')}>Inspect in employer inbox →</button></> : !opened ? <Empty title="Start with the role."><p>Open the job and read its requirements before preparing a packet.</p></Empty> : <>
        <EvidencePicker prefix="application" selected={selected} change={setSelected} />
        <button disabled={!selected.length} onClick={() => send({ type: 'prepare_application', selected }, 'Application preview prepared. Confirm the exact sharing scope below.')}>Review application package ({selected.length})</button>
        {prepared && <section className="dj-preview" aria-label="Application preview"><span className="dj-kicker">Exact application preview</span><h3>Ananya → {job.company}</h3><p>{app.selected.length} selected materials. Every other artifact stays outside the employer packet.</p><EvidenceMaterials artifacts={getArtifacts('ananya', app.selected)} />
          <label className="dj-consent"><input type="checkbox" checked={app.consent} onChange={event => send({ type: 'application_consent', consent: event.target.checked }, 'Application sharing preference updated.')} />I allow only these selected fictional materials to be shared inside this local demonstration.</label>
          <button className="dj-primary" disabled={!app.consent} onClick={() => send({ type: 'submit_application', at: now() }, 'Demo application recorded locally. Nothing was sent to a real employer.')}>Submit demo application</button>
        </section>}
        {!prepared && app.status === 'prepared' && <p className="dj-footnote">Selection changed. Review the updated package to renew consent.</p>}
      </>}
    </section></div>;
}

export function RequirementEvidence({ artifacts }: { artifacts: DemoArtifact[] }) {
  return <section aria-label="Requirement-to-evidence mapping"><h3>Requirements ↔ shared evidence</h3><p className="dj-muted">Deterministic fixture references. No ranking, competence score or automated verdict.</p><div className="dj-map">{requirementMapping(artifacts).map(row => <article key={row.id}><h4>{row.requirement}</h4><Tag tone={row.support.length ? '' : 'dj-neutral'}>{row.status}</Tag>{row.support.length ? <ul>{row.support.map(item => <li key={item.id}><strong>{item.text}</strong><small>{item.id} · {item.limitation}</small></li>)}</ul> : <p>No supporting shared observation. Missing evidence is not a rejection.</p>}</article>)}</div></section>;
}
export function EmployerProfile({ state, id }: { state: DemoState; id: CandidateId }) {
  const packet = employerApplication(state, id);
  if (!packet) return <Empty title="No application shared yet."><p>{getCandidate(id).name} has not submitted a local demo package. Private artifacts are not available to the employer.</p></Empty>;
  return <div className="dj-profile"><div className="dj-heading"><div><span className="dj-kicker">Fictional profile · synthetic provenance</span><h2>{packet.name}</h2></div><Tag>meta.isMock: true</Tag></div><p>Interested in {job.title}. {packet.artifacts.length} shared materials available for a human technical conversation.</p><div className="dj-notice"><strong>Application-sharing scope</strong><p>{packet.application.origin === 'seeded_demo_application' ? 'Pre-seeded fictional application; consent is part of the fixture, not consent from a real person.' : 'Explicit demo consent recorded by the candidate persona.'} Only the following selected artifacts are visible. Not externally sent.</p><p className="dj-footnote">Local package timestamp: {packet.application.submittedAt}</p></div>
    <EvidenceMaterials artifacts={packet.artifacts} /><RequirementEvidence artifacts={packet.artifacts} />
    <section className="dj-limitations"><h3>Evidence limitations</h3><p>These are synthetic records, not actual PostgreSQL runs for this fictional person. Checks describe the selected reviewed implementation; passing does not prove authorship. Production-scale experience, diagram correctness, credentials and general competence remain unassessed.</p><p>Candidate writing and self-report are labelled individually. No AI interpretation or live model feedback is used in this workspace.</p></section>
  </div>;
}
function EmployerView({ state, send }: { state: DemoState; send: Send }) {
  const [selected, setSelected] = useState<CandidateId>('kabir');
  const [filter, setFilter] = useState<'all' | 'shortlisted'>('all');
  const [confirm, setConfirm] = useState<CandidateId | null>(null);
  const [note, setNote] = useState('');
  const [posting, setPosting] = useState(false);
  const visible = candidateIds.filter(id => filter === 'all' || isShortlisted(state, id));
  const packet = employerApplication(state, selected);
  return <>
    <section className="dj-card dj-employer-job"><div><span className="dj-kicker">Recruiter workspace / fictional organization</span><h2>{job.company}</h2><p>{job.title} · {state.job === 'draft' ? 'Draft posting' : 'Published to demo board'}</p></div><div className="dj-actions"><button aria-expanded={posting} onClick={() => setPosting(value => !value)}>{posting ? 'Hide posting' : 'View posting'}</button><button className="dj-primary" disabled={state.job === 'published_demo'} onClick={() => send({ type: 'publish' }, 'Job published to the local demo board. Switch to Candidate to apply.')}>{state.job === 'draft' ? 'Publish to demo board' : 'Published locally'}</button></div>{posting && <div className="dj-full"><JobPosting /></div>}</section>
    <div className="dj-employer-grid"><aside className="dj-card dj-inbox"><div className="dj-heading"><h2>Applicant inbox</h2><Tag>{candidateIds.filter(id => state.applications[id].status === 'submitted_demo').length} local packets</Tag></div><p className="dj-footnote">Kabir and Meera are pre-seeded. Ananya appears when the candidate persona submits.</p><div className="dj-segments" aria-label="Applicant filter"><button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All candidates</button><button aria-pressed={filter === 'shortlisted'} onClick={() => setFilter('shortlisted')}>Manual shortlist</button></div>
      {!visible.length && <Empty title="No manual shortlists yet."><p>Inspect shared evidence, then make an explicit recruiter decision.</p></Empty>}
      {visible.map(id => { const application = employerApplication(state, id); return <article className={`dj-applicant ${selected === id ? 'dj-selected' : ''}`} key={id}><div className="dj-heading"><h3>{getCandidate(id).name}</h3><span className="dj-avatar" aria-hidden="true">{getCandidate(id).name.split(' ').map(part => part[0]).join('')}</span></div><p className="dj-footnote">Fictional candidate · {job.title}</p><Tag tone={isShortlisted(state, id) ? 'dj-positive' : ''}>{isShortlisted(state, id) ? 'Shortlisted · human demo action' : application ? 'Submitted demo application' : 'Not submitted'}</Tag><p>{application ? application.artifacts.map(item => item.label).join(' · ') : 'No evidence has been shared with this workspace.'}</p><button aria-pressed={selected === id} onClick={() => setSelected(id)}>View {getCandidate(id).name.split(' ')[0]}’s profile</button></article>; })}
    </aside><section className="dj-card"><EmployerProfile state={state} id={selected} />{packet && <section className="dj-decision"><h3>Your review decision</h3><p>A shortlist opens a fictional technical conversation. It is a human demo action; no invitations or hiring decisions are sent.</p>{isShortlisted(state, selected) ? <><Tag tone="dj-positive">Shortlisted locally</Tag><button onClick={() => send({ type: 'reverse_shortlist', candidateId: selected, at: now() }, 'Demo shortlist reversed. The local history retains both actions.')}>Reverse demo shortlist</button></> : <button className="dj-primary" disabled={state.decisions.length >= 199} onClick={() => { setNote(''); setConfirm(selected); }}>Shortlist for technical conversation</button>}
      <h4>Local decision history</h4>{!state.decisions.some(item => item.candidateId === selected) ? <p className="dj-muted">No manual action recorded.</p> : <ol className="dj-history">{state.decisions.filter(item => item.candidateId === selected).map((item, index) => <li key={index}><strong>{item.decision === 'shortlisted_demo' ? 'Shortlisted by demo recruiter' : 'Shortlist reversed'}</strong><p>{item.reviewerNote || 'No reviewer note added.'}</p><small><time dateTime={item.timestamp}>{item.timestamp}</time> · {item.provenance} · Fictional demo</small></li>)}</ol>}
    </section>}</section></div>
    {confirm && <Confirmation title={`Shortlist ${getCandidate(confirm).name}?`} label="Confirm human demo shortlist" close={() => setConfirm(null)} confirm={() => { if (send({ type: 'shortlist', candidateId: confirm, confirmed: true, note, at: now() }, 'Human demo shortlist recorded locally. No invitation was sent.')) setConfirm(null); }}><p>Record a manual shortlist for {job.title}. This does not assess code authorship or promise an interview.</p><label className="dj-field">Reviewer note (optional)<textarea maxLength={500} value={note} onChange={event => setNote(event.target.value)} placeholder="What would you explore in a technical conversation?" /></label></Confirmation>}
  </>;
}

export function MentorPacketView({ state }: { state: DemoState }) {
  const packet = mentorPacket(state);
  if (!packet || packet.status !== 'example_review_available') return <Empty title="No fictional review request yet."><p>Use Candidate → Mentor review to choose a question, preview exact materials and request an example review.</p></Empty>;
  return <><div className="dj-heading"><div><span className="dj-kicker">Fictional request / Ananya Mehta</span><h2>Review context</h2></div><Tag>Seeded response available</Tag></div><p className="dj-footnote">Request recorded locally: {packet.requestedAt}. No real message was delivered.</p><h3>Technical question</h3><blockquote>{packet.question}</blockquote><h3>Exact included artifacts</h3><EvidenceMaterials artifacts={packet.artifacts} /><MentorResponse state={state} /></>;
}
function MentorResponse({ state }: { state: DemoState }) {
  const response = exampleResponse(state);
  if (!response) return null;
  return <section className="dj-response"><span className="dj-kicker">Seeded example / {mentor.name}</span><h3>{exampleLabel}</h3><p>{response.text}</p><p className="dj-footnote">Shared fixture references: {response.references.join(', ')}. General guidance is illustrative, not an assessment of unselected artifacts.</p><div className="dj-next"><strong>{response.nextAction}</strong><a href="/lab">Open HLD/LLD Engineering Lab →</a><small>Navigation handoff to the real lab. Choose your own saved attempt there; no diagram is changed by this demo.</small></div></section>;
}
function MentorRequest({ state, send, switchPersona }: { state: DemoState; send: Send; switchPersona: (value: Persona) => void }) {
  const packet = state.mentor;
  const [selected, setSelected] = useState(packet.selected);
  const [question, setQuestion] = useState(packet.question);
  const prepared = packet.status === 'packet_prepared' && packet.question === question.trim() && selected.length === packet.selected.length && selected.every(id => packet.selected.includes(id));
  if (packet.status === 'example_review_available') return <section className="dj-card"><MentorPacketView state={state} /><div className="dj-actions"><button onClick={() => switchPersona('Mentor')}>Open mentor perspective →</button><button onClick={() => send({ type: 'prepare_mentor', selected, question }, 'Mentor packet reopened. Review and renew consent before requesting another example.')}>Revise demo review packet</button></div></section>;
  return <div className="dj-columns"><section className="dj-card"><span className="dj-kicker">Ananya’s retry-safe-credit investigation</span><h2>Ask a focused technical question.</h2><p>{mentor.name} is a fictional {mentor.focus.toLowerCase()} mentor. This prepares a local packet and a seeded example response.</p><label className="dj-field" htmlFor="dj-question">Technical problem<textarea id="dj-question" maxLength={1000} value={question} onChange={event => setQuestion(event.target.value)} /></label><EvidencePicker prefix="mentor" selected={selected} change={setSelected} mentorOnly /><button disabled={!selected.length || !question.trim()} onClick={() => send({ type: 'prepare_mentor', selected, question }, 'Exact mentor packet prepared. Check the materials and sharing consent.')}>Preview mentor packet ({selected.length})</button></section>
    <section className="dj-card"><span className="dj-kicker">Private until confirmed / local demonstration</span><h2>Review the sharing scope</h2>{prepared ? <><blockquote>{packet.question}</blockquote><EvidenceMaterials artifacts={getArtifacts('ananya', packet.selected)} /><label className="dj-consent"><input type="checkbox" checked={packet.consent} onChange={event => send({ type: 'mentor_consent', consent: event.target.checked }, 'Mentor sharing preference updated.')} />I allow these selected fictional materials in the local mentor simulation.</label><button className="dj-primary" disabled={!packet.consent} onClick={() => send({ type: 'request_mentor', at: now() }, 'Demo review requested locally. A labelled seeded response is now available.')}>Request demo review</button></> : <Empty title="Choose context, then preview."><p>No material is shared by default. Changing your question or selection requires a fresh preview and consent.</p></Empty>}</section></div>;
}

/** Synthetic, local-only experience. No API, Clerk or router provider dependency. */
export function EmployerMentorDemo() {
  const [loaded] = useState(() => loadDemoState(browserStorage()));
  const [state, setState] = useState<DemoState>(loaded.state);
  const [persona, setPersona] = useState<Persona>('Candidate');
  const [candidateTab, setCandidateTab] = useState<'opportunity' | 'mentor'>('opportunity');
  const [message, setMessage] = useState(loaded.notice || 'Use the demo personas to follow one connected, fictional journey.');
  const [storageFailed, setStorageFailed] = useState(false);
  const [reset, setReset] = useState(false);
  const [epoch, setEpoch] = useState(0);
  useEffect(() => { setStorageFailed(!saveDemoState(browserStorage(), state)); }, [state]);
  const send: Send = (action, text) => {
    try { const next = transition(state, action); setState(next); setMessage(text); return true; }
    catch (error) { setMessage(error instanceof Error ? error.message : 'The demo action could not be completed.'); return false; }
  };
  const steps = [state.job === 'published_demo', state.applications.ananya.status === 'submitted_demo', isShortlisted(state, 'ananya'), state.mentor.status === 'example_review_available'];
  return <main id="main-content" tabIndex={-1} className="demo-journey" data-demo-provenance="fictional" data-is-mock="true">
    <div className="dj-heading dj-top"><div><span className="dj-kicker">TrajectoryOs / connected journey</span><h1>From engineering evidence to a conversation.</h1><p>One fictional role. Selected evidence. Human review.</p></div><button onClick={() => setReset(true)}>Reset demo</button></div>
    <div className="dj-banner"><div className="dj-tags"><Tag>Fictional demo</Tag><Tag>Not externally sent</Tag><Tag>meta.isMock: true</Tag></div><p>Synthetic records only. Persona switching simulates perspectives; it does not impersonate an account or grant production access.</p></div>
    <ol className="dj-progress" aria-label="Connected demo progress">{['Publish opportunity', 'Share application', 'Manual shortlist', 'Mentor next step'].map((text, index) => <li key={text} data-complete={steps[index]}><span aria-hidden="true">{steps[index] ? '✓' : `0${index + 1}`}</span>{text}<small>{steps[index] ? 'Recorded locally' : 'Not completed'}</small></li>)}</ol>
    <div className="dj-toolbar"><div className="dj-personas" role="group" aria-label="Demo persona switcher">{(['Candidate', 'Employer', 'Mentor'] as const).map(value => <button key={value} aria-pressed={persona === value} onClick={() => setPersona(value)}>{value}<small>{value === 'Candidate' ? 'Ananya Mehta' : value === 'Employer' ? 'Northstar recruiter' : mentor.name}</small></button>)}</div><span className="dj-footnote">Shared state · this browser only</span></div>
    <p className="dj-status" role="status">{message}</p>{storageFailed && <p className="dj-error" role="alert">Browser storage is unavailable or full. The workflow works in memory; refreshing may lose demo changes.</p>}
    <div key={epoch}>{persona === 'Candidate' ? <><div className="dj-segments dj-candidate-tabs" role="group" aria-label="Candidate workspace"><button aria-pressed={candidateTab === 'opportunity'} onClick={() => setCandidateTab('opportunity')}>Opportunity & application</button><button aria-pressed={candidateTab === 'mentor'} onClick={() => setCandidateTab('mentor')}>Mentor review</button></div>{candidateTab === 'opportunity' ? <CandidateApplicationView state={state} send={send} switchPersona={setPersona} /> : <MentorRequest state={state} send={send} switchPersona={setPersona} />}</> : persona === 'Employer' ? <EmployerView state={state} send={send} /> : <section className="dj-card"><div className="dj-mentor-heading"><span className="dj-avatar" aria-hidden="true">MS</span><div><span className="dj-kicker">Fictional mentor perspective</span><h2>{mentor.name} · {mentor.focus}</h2><p>No live messaging, availability or booking.</p></div></div><MentorPacketView state={state} /></section>}</div>
    <footer className="dj-footer">Demo packages stay in this browser across signed-in accounts. Use Reset demo before handing over a shared device. Never enter real résumés, personal details or secrets.</footer>
    {reset && <Confirmation title="Restore the initial fictional scenario?" label="Reset local demo" close={() => setReset(false)} confirm={() => { if (send({ type: 'reset' }, 'Demo reset: draft job, no Ananya application, no shortlist or mentor request. Seeded Kabir and Meera packets restored.')) { setEpoch(value => value + 1); setCandidateTab('opportunity'); setPersona('Candidate'); setReset(false); } }}><p>This clears only this demonstration’s local selections, consent, review request and manual decisions. Kabir and Meera’s seeded application packets return.</p></Confirmation>}
  </main>;
}
