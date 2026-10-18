export function EvidenceComparison() {
  return <figure className="lp-comparison" aria-label="Illustration of a retry-safe credit engineering challenge and its evidence">
    <div className="lp-case-top"><span><i aria-hidden="true" /> ENGINEERING FILE / 01</span><span>RETRY-SAFE CREDITS</span></div>
    <div className="lp-case-question"><span>THE BRIEF</span><h2>One credit.<br />Two requests.</h2><p>The database commits. The response never arrives. The client tries again.</p></div>
    <div className="lp-case-sequence" aria-label="Illustrative credit retry">
      <div><span>01</span><strong>POST /credits</strong><small>Original request</small></div>
      <div><span>02</span><strong>201 Created</strong><small>Response lost</small></div>
      <div className="lp-case-sequence-last"><span>03</span><strong>POST /credits</strong><small>Same key. What now?</small></div>
    </div>
    <div className="lp-case-divider"><span>WHAT THE STUDENT LEAVES WITH</span><span>↘</span></div>
    <div className="lp-case-artifacts"><div><strong>HLD / LLD</strong><span>Design decisions</span></div><div><strong>T1–T7</strong><span>PostgreSQL observations</span></div><div><strong>WHY</strong><span>Written explanation</span></div></div>
    <figcaption>Illustrative product visualization — not a real learner submission or test run.</figcaption>
  </figure>;
}
