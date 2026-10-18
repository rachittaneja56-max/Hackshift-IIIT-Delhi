const skills = ['Networking', 'PostgreSQL', 'System Design', 'TypeScript'];
const evidence = [
  ['01', 'Saved HLD / LLD', 'A request path and transaction boundary drawn in Excalidraw.'],
  ['02', 'Investigated implementation', 'A reviewed variant chosen, with the reason recorded.'],
  ['03', 'Test observations', 'PostgreSQL checks show what the selected variant did.'],
  ['04', 'Documented failure', 'A duplicate credit on retry remains visible in the record.'],
  ['05', 'Engineering explanation', 'A written account of the decision and observed result.'],
] as const;

export function EvidenceComparison() {
  return <figure className="lp-comparison" aria-label="Illustration comparing a list of claimed skills with an engineering evidence record">
    <div className="lp-resume">
      <div className="lp-paper-top"><span>PROFILE / 001</span><span>SKILLS</span></div>
      <div className="lp-resume-name">The claim.</div>
      <p>What a résumé can list</p>
      <ul>{skills.map(skill => <li key={skill}><span className="lp-skill-square" aria-hidden="true" />{skill}</li>)}</ul>
      <div className="lp-paper-foot">A useful starting point.<br />But what happened when the system failed?</div>
    </div>
    <div className="lp-comparison-arrow" aria-hidden="true"><span>→</span></div>
    <div className="lp-record">
      <div className="lp-record-top"><span className="lp-record-dot" aria-hidden="true" /><span>ENGINEERING RECORD</span><span>RETRY-SAFE CREDITS / 01</span></div>
      <div className="lp-record-title">The work behind it.</div>
      <ol>{evidence.map(([number, title, detail]) => <li key={number}><span>{number}</span><div><strong>{title}</strong><small>{detail}</small></div></li>)}</ol>
      <div className="lp-record-foot"><span>DECISIONS + OBSERVATIONS</span><span>↗</span></div>
    </div>
    <figcaption>Illustrative product visualization · Example text, not a captured learner record or test run.</figcaption>
  </figure>;
}
