import { EvidenceMaterials } from './components';
import { getCandidate, type DemoArtifact } from './fixtures';
import { candidateHistory, sharedHistory, type HistoryEvent } from './history';
import { exampleResponse, type DemoState } from './model';

const labels: Record<HistoryEvent['type'], string> = {
  learning: 'Related learning · fictional', design: 'Submitted design summary', investigation: 'Candidate writing',
  observation: 'Synthetic evaluation', question: 'Private mentor question', guidance: 'Illustrative feedback · fictional',
  application: 'Local application', shortlist: 'Human demo shortlist',
};
export function EngineeringTimeline({ events, artifacts }: { events: readonly HistoryEvent[]; artifacts: readonly DemoArtifact[] }) {
  return <ol className="dj-engineering-timeline">{events.map((event, index) => {
    const materials = artifacts.filter(item => event.relatedArtifactIds?.includes(item.id));
    return <li key={event.id} data-history-type={event.type}>
      <span className="dj-timeline-marker" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
      <div className="dj-event-body"><small className="dj-event-label">{labels[event.type]}</small><h4>{event.title}</h4><p>{event.summary}</p>
        {!!materials.length && <details className="dj-event-details"><summary>{event.type === 'design' ? 'View design' : event.type === 'observation' ? 'Inspect test observation' : event.type === 'question' || event.type === 'guidance' ? 'Open mentorship context' : 'Read selected materials'}</summary><EvidenceMaterials artifacts={materials} /></details>}
      </div>
    </li>;
  })}</ol>;
}
export function CandidateHistory({ state, openMentor }: { state: DemoState; openMentor?: () => void }) {
  const events = candidateHistory(state);
  const response = exampleResponse(state);
  return <section className="dj-journey-section" id="engineering-history" aria-label="My Engineering Journey">
    <div className="dj-heading"><div><span className="dj-kicker">Backend reliability / Learning path</span><h2>My Engineering Journey</h2></div><span className="dj-tag">Ananya’s private example history</span></div>
    <p className="dj-path">Computer Networks <span>→</span> Database Transactions <span>→</span> System Design</p>
    <div className="dj-history-layout"><EngineeringTimeline events={events} artifacts={getCandidate('ananya').artifacts} />
      <aside className="dj-focus-panel"><span className="dj-kicker">Engineering Lab · Attempt v1</span><h3>Retry-safe Credit API</h3><p>Learn → Design → Investigate → Observe → Ask for Guidance → Share Evidence → Employer Review.</p><div className="dj-result-callout"><strong>6/7</strong><span>synthetic checks passed<br /><b>Concurrent-retry check failed</b></span></div><h4>Current learning focus</h4><p>Transaction boundaries under concurrency.</p>{response ? <><h4>Next suggested action</h4><p>{response.nextAction}</p><small>Suggestion only. Designs, test results and the submitted package stay as recorded.</small></> : <p className="dj-muted">Bring your uncertainty to a focused mentor question.</p>}{openMentor && <button onClick={openMentor}>Open mentorship context ↗</button>}<small>Fictional learning interactions and representative artifacts; no LMS completion or live database run.</small></aside>
    </div>
  </section>;
}
// This component accepts a packet, never state or a candidate fixture ID.
export function SharedHistory({ artifacts }: { artifacts: readonly DemoArtifact[] }) {
  const events = sharedHistory(artifacts);
  return <section className="dj-shared-journey" aria-label="Shared engineering timeline"><div className="dj-heading"><div><span className="dj-kicker">The thinking behind the work</span><h3>Shared engineering timeline</h3></div><span className="dj-tag">Selected materials only</span></div><p className="dj-footnote">A chronology of submitted design, investigation and observation material. Private learning and mentorship activity are excluded.</p>{events.length ? <EngineeringTimeline events={events} artifacts={artifacts} /> : <p>No engineering milestones are supported by this packet.</p>}</section>;
}
