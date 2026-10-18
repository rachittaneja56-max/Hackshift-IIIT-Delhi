import { Link } from '../app/router';

const stages = [
  ['01', 'Read the failure', 'A short lesson introduces retries and database boundaries.'],
  ['02', 'Design a response', 'Draw HLD and LLD. Choose how writes should commit.'],
  ['03', 'Investigate code', 'Compare reviewed variants, or try the separate AI debugging lab.'],
  ['04', 'Run the checks', 'Examine recorded PostgreSQL results or sandbox test output.'],
  ['05', 'Keep the record', 'Save the choices, observations, and failures together.'],
] as const;

export function EngineeringJourney() {
  return <section className="lp-section lp-journey" id="how-it-works" aria-labelledby="lp-journey-title">
    <div className="lp-section-intro lp-journey-intro"><span className="lp-kicker">02 / THE WORK</span><h2 id="lp-journey-title">A learning path that ends with <span>something to examine.</span></h2><p>Not another completed-course badge. A sequence of decisions and actual test observations that stays attached to the work.</p></div>
    <ol className="lp-journey-track">{stages.map(([number,title,detail]) => <li key={number}><span className="lp-journey-number">{number}</span><h3>{title}</h3><p>{detail}</p></li>)}</ol>
    <div className="lp-journey-outcomes">
      <div className="lp-outcomes-lead"><span className="lp-kicker">WHAT CAN HAPPEN NEXT?</span><p>The record is useful because it travels with the question, not because it claims to certify a student.</p></div>
      <div className="lp-outcome"><span className="lp-outcome-number">A</span><h3>More focused guidance</h3><p>Select an attempt and a specific question. Preview the context a mentor could receive.</p><Link href="/demo/journey">See the mentor example ↗</Link></div>
      <div className="lp-outcome"><span className="lp-outcome-number">B</span><h3>A better career conversation</h3><p>Compare role requirements with selected engineering evidence, including gaps and failures.</p><Link href="/demo/journey">See the employer example ↗</Link></div>
    </div>
    <p className="lp-footnote">The mentor and employer interactions in the linked journey are fictional demonstrations. No messages or applications are sent.</p>
  </section>;
}
