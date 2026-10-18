import { useState } from 'react';

const steps = [
  { label: 'Request', title: 'Client sends a credit request.', detail: 'A synthetic account credit is sent with an idempotency key.' },
  { label: 'Commit', title: 'The API commits the operation.', detail: 'The database effect and response record should be committed together.' },
  { label: 'Timeout', title: 'The HTTP response is lost.', detail: 'The client cannot tell whether the operation succeeded.' },
  { label: 'Retry', title: 'The client tries again.', detail: 'The same logical request reaches the API a second time.' },
  { label: 'Fault', title: 'A faulty version credits twice.', detail: 'A repeated effect is an observable failure, not a second customer action.' },
  { label: 'Safe return', title: 'A retry-safe version replays the stored result.', detail: 'The original outcome returns without applying another credit.' },
] as const;

export function ProblemSequence() {
  const [active, setActive] = useState(0);
  return <section className="lp-section lp-problem" id="the-problem" aria-labelledby="lp-problem-title">
    <div className="lp-section-intro"><span className="lp-kicker">01 / THE ENGINEERING QUESTION</span><h2 id="lp-problem-title">The request repeated.<br /><em>Should the database effect repeat?</em></h2><p>A timeout turns one synthetic credit into a reliability problem. Follow the sequence, then compare the two possible endings.</p></div>
    <div className="lp-sequence" aria-label="Six-step retry scenario">
      <ol className="lp-sequence-steps">{steps.map((step, index) => <li key={step.label}><button type="button" className={active === index ? 'is-active' : ''} aria-current={active === index ? 'step' : undefined} onClick={() => setActive(index)}><span>{String(index + 1).padStart(2, '0')}</span><strong>{step.label}</strong></button></li>)}</ol>
      <div className="lp-sequence-stage" aria-live="polite"><div className="lp-sequence-graphic" aria-hidden="true"><span className="lp-node">CLIENT</span><span className="lp-connector">→</span><span className="lp-node lp-node-api">API</span><span className="lp-connector">→</span><span className="lp-node">POSTGRESQL</span></div><div className="lp-stage-bottom"><span className="lp-stage-index">{String(active + 1).padStart(2, '0')} / 06</span><div><h3>{steps[active].title}</h3><p>{steps[active].detail}</p></div><div className="lp-stage-controls"><button type="button" aria-label="Previous step" disabled={active === 0} onClick={() => setActive(active - 1)}>←</button><button type="button" aria-label="Next step" disabled={active === steps.length - 1} onClick={() => setActive(active + 1)}>→</button></div></div></div>
    </div>
    <details className="lp-sequence-fallback"><summary>Read the complete six-step sequence</summary><ol>{steps.map(step => <li key={step.label}><strong>{step.title}</strong> {step.detail}</li>)}</ol></details>
    <p className="lp-sequence-note">Synthetic credits only. The architecture lab evaluates reviewed implementations with recorded PostgreSQL checks; this illustration is not a live test result.</p>
  </section>;
}
