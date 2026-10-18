import { useEffect, useId, useState } from 'react';
import type { LessonBlock } from '@trajectoryos/contracts';
import '../components/sequence.css';

function Inline({ text }: { text: string }) {
  return <>{text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)]+\))/g).map((part, i) => {
    if (part.startsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    const match = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    return match ? <a key={i} href={match[2]} target="_blank" rel="noreferrer">{match[1]}</a> : part;
  })}</>;
}

// Lesson content is plain text: raw HTML and executable links are not accepted.
export function Markdown({ text }: { text: string }) {
  return <>{text.split(/\n\s*\n/).map((paragraph, i) => {
    if (paragraph.startsWith('```')) return <pre key={i}><code>{paragraph.replace(/^```[^\n]*\n?/, '').replace(/```$/, '')}</code></pre>;
    return <div key={i}>{paragraph.split('\n').map((line, j) => line.startsWith('### ') ? <h3 key={j}><Inline text={line.slice(4)} /></h3> : line.startsWith('## ') ? <h2 key={j}><Inline text={line.slice(3)} /></h2> : line.startsWith('# ') ? <h2 key={j}><Inline text={line.slice(2)} /></h2> : /^[-*] /.test(line) ? <p className="list-line" key={j}><span aria-hidden="true">•</span> <Inline text={line.slice(2)} /></p> : <p key={j}><Inline text={line} /></p>)}</div>;
  })}</>;
}

export function MermaidBlock({ source }: { source: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let alive = true;
    import('mermaid').then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral', flowchart: { htmlLabels: false } });
      const output = await mermaid.render(`diagram${id}`, source);
      if (alive) setSvg(output.svg);
    }).catch(() => { if (alive) setSvg(''); });
    return () => { alive = false; };
  }, [source, id]);
  return <figure>{svg && <iframe sandbox="" className="mermaid-frame" title="Published lesson diagram" srcDoc={`<!doctype html><html><body style="margin:0">${svg}</body></html>`} />}<details open={!svg}><summary>Diagram source and text alternative</summary><pre>{source}</pre></details></figure>;
}

export function LessonBlockView({ block }: { block: LessonBlock }) {
  return <section className={block.type === 'callout' ? `notice ${block.tone}` : ''} id={block.id}>
    {block.type === 'code' ? <><span className="eyebrow">{block.language}</span><pre><code>{block.code}</code></pre></> : block.type === 'diagram' ? <MermaidBlock source={block.source} /> : <Markdown text={block.markdown} />}
    {block.sourceIds.length > 0 && <div className="source-refs"><span>Sources:</span> {block.sourceIds.map(id => <a href={`#source-${id}`} key={id}>{id}</a>)}</div>}
  </section>;
}

function ResponseTrace() {
  return <figure className="response-trace">
    <figcaption>One intended credit operation · one transaction · an application-level retry</figcaption>
    <p className="sequence-summary">The API owns idempotency. PostgreSQL stores the key, balance change, ledger entry and replayable response together. If the HTTP response is lost after commit, a new HTTP request returns through the API and reads that durable record.</p>
    <svg className="sequence-visual" viewBox="0 0 900 610" role="img" aria-labelledby="sequence-title sequence-description">
      <title id="sequence-title">Retry-safe credit request sequence</title><desc id="sequence-description">Client sends an HTTP request to the API. The API uses one PostgreSQL transaction. PostgreSQL returns its commit result to the API. The HTTP response from API to client may be lost after commit. The client then makes a separate application-level retry. The API reads the durable idempotency record and PostgreSQL returns the stored response to the API, which replays it to the client without applying another credit.</desc>
      <defs><marker id="sequence-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0 0L9 4.5L0 9Z" fill="currentColor" /></marker><marker id="sequence-arrow-lost" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0 0L9 4.5L0 9Z" fill="currentColor" /></marker></defs>
      <g className="sequence-nodes"><rect x="38" y="20" width="180" height="48" rx="10"/><rect x="360" y="20" width="180" height="48" rx="10"/><rect x="682" y="20" width="180" height="48" rx="10"/><text x="128" y="50">Client</text><text x="450" y="50">API</text><text x="772" y="50">PostgreSQL</text></g>
      <g className="sequence-lifelines"><path d="M128 68V590"/><path d="M450 68V590"/><path d="M772 68V590"/></g>
      <g className="sequence-message request"><path d="M142 112H436" markerEnd="url(#sequence-arrow)"/><text x="289" y="101">1 · HTTP request · account key + payload</text></g>
      <g className="sequence-message db-operation"><path d="M464 170H758" markerEnd="url(#sequence-arrow)"/><text x="611" y="157">2 · Begin transaction · reserve key and write</text></g>
      <g className="sequence-message db-return"><path d="M758 220H464" markerEnd="url(#sequence-arrow)"/><text x="611" y="208">3 · Commit result → API</text></g>
      <g className="sequence-message lost-response"><path d="M436 282H142" markerEnd="url(#sequence-arrow-lost)"/><path d="M284 273l12 18m0-18 12 18"/><text x="289" y="266">4 · HTTP response may be lost after commit</text></g>
      <g className="sequence-message retry"><path d="M142 350H436" markerEnd="url(#sequence-arrow)"/><text x="289" y="339">5 · Application-level retry · same key + payload</text></g>
      <g className="sequence-message db-operation"><path d="M464 410H758" markerEnd="url(#sequence-arrow)"/><text x="611" y="397">6 · Read durable account/key/payload record</text></g>
      <g className="sequence-message db-return"><path d="M758 460H464" markerEnd="url(#sequence-arrow)"/><text x="611" y="448">7 · Stored response → API</text></g>
      <g className="sequence-message replay"><path d="M436 530H142" markerEnd="url(#sequence-arrow)"/><text x="289" y="518">8 · Replay HTTP response · no second credit</text></g>
    </svg>
    <ol className="sequence-mobile" aria-label="Request and retry sequence"><li><strong>Client → API · Request</strong><span>Send an HTTP request with an account-scoped idempotency key and payload.</span></li><li><strong>API → PostgreSQL · Database transaction</strong><span>Reserve the key and write the balance, ledger entry and replayable response together.</span></li><li><strong>PostgreSQL → API · Transaction result</strong><span>PostgreSQL returns the commit result to the API.</span></li><li><strong>API → Client · Response may be lost</strong><span>The transaction may be committed even when the client sees a timeout.</span></li><li><strong>Client → API · Application-level retry</strong><span>The client sends a new HTTP request with the same key and payload.</span></li><li><strong>API → PostgreSQL → API · Durable lookup</strong><span>The API reads the account/key record and PostgreSQL returns the stored response.</span></li><li><strong>API → Client · Replay</strong><span>The API replays the first result without applying another credit.</span></li></ol>
    <p className="diagram-note">This retry is a new application request, not a TCP retransmission. TCP cannot determine whether the database transaction committed.</p>
    <div className="response-outcomes">
      <section className="outcome unsafe"><span className="eyebrow">Without a durable idempotency record</span><h3>The handler may apply the credit again.</h3><p>Each application request can reach the business operation independently.</p></section>
      <section className="outcome safe"><span className="eyebrow">With a durable idempotency record</span><h3>Replay the first response.</h3><p>Find the original account, key and payload identity; return the stored result without another credit.</p></section>
    </div>
  </figure>;
}

function ConceptCheck({ question, answer }: { question: string; answer: string }) {
  return <details className="concept-check"><summary>Check your understanding: {question}</summary><p>{answer}</p></details>;
}

export function EditorialCompanion() {
  return <section className="companion" id="companion">
    <span className="eyebrow">Local editorial companion · separate from published lesson v1</span>
    <h2>How can a lost response lead to a second write?</h2>
    <p>A client cannot tell from a timeout whether the server rejected a request, is still processing it, or already committed the database transaction. The retry is a new application request, so the handler may run again.</p>
    <ResponseTrace />
    <section className="concept-section"><span className="eyebrow">01 / Give the operation a stable identity</span><h3>Reuse the same key and payload on retry.</h3>
      <p>The client chooses an idempotency key once for an intended operation and reuses it for application retries. Here the key is scoped to an account, so two accounts can use the same key independently. The server also compares a canonical payload identity: reusing a key with a different amount is a conflict.</p>
      <div className="example-heading"><span className="eyebrow">Illustrative HTTP request</span><span className="small muted">Not a TrajectoryOs API route</span></div>
      <pre className="code-example"><code>{`POST /example/accounts/demo/credits\nIdempotency-Key: operation-7\nContent-Type: application/json\n\n{"amountMinor": 250}\n\nA retry reuses the same key and payload.\nA completed replay returns the stored response.`}</code></pre>
      <ConceptCheck question="What should a timeout tell the client about the database write?" answer="Nothing conclusive. The transaction may have committed before the response was lost, so a retry needs a durable operation identity to find and replay the first result." />
    </section>
    <section className="concept-section"><span className="eyebrow">02 / Keep related writes atomic</span><h3>A unique key does not protect separate commits.</h3>
      <p>If the balance commits before the operation record, a crash can leave a credit with no durable replay record. A retry may then apply the same intended operation again.</p>
      <div className="expected-actual"><section><span className="eyebrow">Illustrative SQL example · unsafe sequence</span><pre className="code-example code-example--sql" aria-label="Illustrative SQL example showing a balance update committed before the operation key is recorded"><code><span><b className="sql-keyword">UPDATE</b> account SET balance = balance + 250;</span><span className="code-comment">-- commits</span><span className="code-comment">-- crash before the key is recorded</span><span><b className="sql-keyword">INSERT</b> operation(key, payload, response);</span></code></pre></section><section><span className="eyebrow">Required transaction boundary</span><p>Key reservation, balance change, ledger entry and replayable response use one checked-out connection and commit or roll back together.</p></section></div>
      <p>A competing insert can wait for the first transaction. After it commits, the retry reads the stored response in a subsequent statement. Distinct keys must still preserve concurrent credits to the same account.</p>
      <ConceptCheck question="Which records should roll back after a failure following the balance update?" answer="Every write in the operation: the balance change, operation reservation, ledger entry and response record. The retry should be able to apply the credit once and store its result." />
    </section>
    <section className="concept-section lab-connection"><span className="eyebrow">03 / Apply it in the engineering lab</span><h3>Draw where the operation becomes durable.</h3>
      <p>Show where the key is checked, where the transaction begins and ends, and what a retry reads. Then compare the supplied implementations and inspect the disclosed PostgreSQL observations.</p>
      <p className="small muted">The checks cover specific synthetic database cases. They do not prove every concurrency schedule, diagram correctness or exactly-once external side effects.</p>
    </section>
    <p className="small muted companion-provenance">Authored locally for this frontend · editorial review pending. This companion is outside the published lesson hash. References: <a href="https://www.rfc-editor.org/rfc/rfc9110.html#name-idempotent-methods" target="_blank" rel="noreferrer">HTTP semantics</a>, <a href="https://www.postgresql.org/docs/current/tutorial-transactions.html" target="_blank" rel="noreferrer">PostgreSQL transactions</a>, <a href="https://node-postgres.com/features/transactions" target="_blank" rel="noreferrer">node-postgres transactions</a>.</p>
  </section>;
}
