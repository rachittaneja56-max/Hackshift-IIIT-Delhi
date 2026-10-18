const stages = [
  ['01', 'LEARN', 'Networking and database fundamentals in the available seeded retry lesson.'],
  ['02', 'DESIGN', 'Save HLD and LLD diagrams in Excalidraw.'],
  ['03', 'INVESTIGATE', 'Compare reviewed code variants or debug in the separate sandbox lab.'],
  ['04', 'TEST', 'Inspect recorded PostgreSQL results or sandbox grading, depending on the lab.'],
  ['05', 'SAVE EVIDENCE', 'Keep decisions, source context and observed behavior together.'],
] as const;

export function EngineeringJourney() {
  return <section className="lp-section lp-journey" id="how-it-works" aria-labelledby="lp-journey-title"><div className="lp-section-intro"><span className="lp-kicker">02 / THE WORKFLOW</span><h2 id="lp-journey-title">One question.<br /><em>A connected record of work.</em></h2><p>Concepts, diagrams, investigation and results stay linked, so a conversation can begin with specific decisions and observations.</p></div><ol className="lp-journey-track">{stages.map(([number, title, detail]) => <li key={number}><span className="lp-journey-number">{number}</span><h3>{title}</h3><p>{detail}</p></li>)}</ol><div className="lp-journey-branches"><div><span className="lp-branch-icon" aria-hidden="true">↗</span><h3>MENTOR GUIDANCE</h3><p>Explore a fictional contextual feedback example. There is no live mentor messaging.</p></div><div><span className="lp-branch-icon" aria-hidden="true">↗</span><h3>CAREER OPPORTUNITIES</h3><p>Analyze a job description privately, then explore fictional employer sharing and manual review.</p></div></div></section>;
}
