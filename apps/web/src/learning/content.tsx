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

const failureSteps = [
  ['01', 'Client sends a credit request', 'The request carries an account-scoped idempotency key.'],
  ['02', 'Backend writes and commits', 'The balance, operation, ledger and replayable response should commit together.'],
  ['03', 'The response is lost', 'The database may have committed even though the client sees a timeout.'],
  ['04', 'Client retries the request', 'This is a second application request using the same operation key.'],
];

function ResponseTrace() {
  return <figure className="response-trace">
    <figcaption>One intended credit operation · two application requests</figcaption>
    <ol className="response-flow" aria-label="Client sends a credit request, the backend commits it, the response is lost, and the client retries with the same key.">
      {failureSteps.map(([number, title, detail]) => <li key={number}><span className="flow-number">{number}</span><div><strong>{title}</strong><p>{detail}</p></div></li>)}
    </ol>
    <div className="response-outcomes">
      <section className="outcome unsafe"><span className="eyebrow">Without a durable idempotency record</span><h3>The handler may apply the credit again.</h3><p>Each application request can reach the business operation independently.</p></section>
      <section className="outcome safe"><span className="eyebrow">With a durable idempotency record</span><h3>Replay the first response.</h3><p>Find the original account, key and payload identity; return the stored result without another credit.</p></section>
    </div>
    <p className="diagram-note">A TCP retransmission repeats byte delivery within a connection. An application retry sends another HTTP request. TCP cannot determine whether the first database transaction committed.</p>
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
      <pre><code>{`POST /example/accounts/demo/credits\nIdempotency-Key: operation-7\nContent-Type: application/json\n\n{"amountMinor": 250}\n\nA retry reuses the same key and payload.\nA completed replay returns the stored response.`}</code></pre>
      <ConceptCheck question="What should a timeout tell the client about the database write?" answer="Nothing conclusive. The transaction may have committed before the response was lost, so a retry needs a durable operation identity to find and replay the first result." />
    </section>
    <section className="concept-section"><span className="eyebrow">02 / Keep related writes atomic</span><h3>A unique key does not protect separate commits.</h3>
      <p>If the balance commits before the operation record, a crash can leave a credit with no durable replay record. A retry may then apply the same intended operation again.</p>
      <div className="expected-actual"><section><span className="eyebrow">Unsafe sequence</span><pre><code>{`UPDATE account SET balance = balance + 250;\n-- commits\n-- crash before the key is recorded\nINSERT operation(key, payload, response);`}</code></pre></section><section><span className="eyebrow">Required transaction boundary</span><p>Key reservation, balance change, ledger entry and replayable response use one checked-out connection and commit or roll back together.</p></section></div>
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
