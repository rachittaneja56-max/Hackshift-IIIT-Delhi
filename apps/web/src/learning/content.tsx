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
// No raw HTML, inline handlers, or executable links are accepted from content.
export function Markdown({ text }: { text: string }) {
  return <>{text.split(/\n\s*\n/).map((paragraph, i) => {
    if (paragraph.startsWith('```')) return <pre key={i}><code>{paragraph.replace(/^```[^\n]*\n?/, '').replace(/```$/, '')}</code></pre>;
    return <div key={i}>{paragraph.split('\n').map((line, j) => line.startsWith('### ') ? <h3 key={j}><Inline text={line.slice(4)} /></h3> : line.startsWith('## ') ? <h2 key={j}><Inline text={line.slice(3)} /></h2> : line.startsWith('# ') ? <h2 key={j}><Inline text={line.slice(2)} /></h2> : /^[-*] /.test(line) ? <p className="list-line" key={j}>• <Inline text={line.slice(2)} /></p> : <p key={j}><Inline text={line} /></p>)}</div>;
  })}</>;
}
export function MermaidBlock({ source }: { source: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, ''); const [svg, setSvg] = useState('');
  useEffect(() => { let alive = true; import('mermaid').then(async ({ default: mermaid }) => { mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral', flowchart: { htmlLabels: false } }); const output = await mermaid.render(`diagram${id}`, source); if (alive) setSvg(output.svg); }).catch(() => { if (alive) setSvg(''); }); return () => { alive = false; }; }, [source, id]);
  // Strict Mermaid produces SVG; sandbox prevents its document from affecting the application.
  return <figure>{svg && <iframe sandbox="" className="mermaid-frame" title="Published lesson diagram" srcDoc={`<!doctype html><html><body style="margin:0">${svg}</body></html>`} />}<details open={!svg}><summary>Mermaid source / text alternative</summary><pre>{source}</pre></details></figure>;
}
export function LessonBlockView({ block }: { block: LessonBlock }) {
  return <section className={block.type === 'callout' ? `notice ${block.tone}` : ''} id={block.id}>
    {block.type === 'code' ? <><span className="eyebrow">{block.language}</span><pre><code>{block.code}</code></pre></> : block.type === 'diagram' ? <MermaidBlock source={block.source} /> : <Markdown text={block.markdown} />}
    {block.sourceIds.length > 0 && <div className="source-refs">Sources: {block.sourceIds.map(id => <a href={`#source-${id}`} key={id}>{id}</a>)}</div>}
  </section>;
}
export function EditorialCompanion() {
  return <section className="companion" id="companion"><span className="eyebrow">Local editorial companion · separate from published v1</span><h2>The response disappeared.<br />Did the write disappear too?</h2>
    <p>A network failure can leave a client uncertain about a successful database write. Imagine that a client asks an API to credit a synthetic account. PostgreSQL commits the transaction, but the response never reaches the client. The client sees a timeout. It cannot determine from that timeout whether the server rejected the request, is still processing it, or already committed.</p>
    <ResponseTrace />
    <p>TCP retransmission repairs byte delivery within a connection. It does not mean a second business operation has been requested. An application retry is different: the client sends another HTTP request, perhaps over a new connection. That request can invoke the handler again. TCP cannot tell the application whether a credit committed after the response was lost.</p>
    <h3>Give the operation a stable identity</h3><p>The client chooses an idempotency key once for the intended operation and reuses it on retries. Here, that identity is scoped to an account. Two different accounts may use the same key independently. The server also records a canonical payload identity, so the same key with a different amount is a conflict rather than a second interpretation of the operation.</p>
    <span className="eyebrow">Illustrative HTTP request · this is not a TrajectoryOs API route</span><pre>{`POST /example/accounts/demo/credits\nIdempotency-Key: operation-7\nContent-Type: application/json\n\n{"amountMinor": 250}\n\nA retry uses the same key AND payload.\nA completed replay returns the original stored response.`}</pre>
    <p>A unique constraint helps arbitrate competing requests. It does not make a sequence of independent commits atomic. If the balance change commits first, an error while recording the key can leave the effect without a durable replay record. Returning a saved response later cannot undo a second credit that has already happened.</p>
    <h3>Find the partial-commit window</h3><pre>{`// Separate-writes counterexample — illustrative pseudocode\nUPDATE account SET balance = balance + 250; // commits\n// A crash here leaves an effect without an operation record.\nINSERT operation(key, payload, response);   // may fail`}</pre>
    <p>The transaction boundary must cover key reservation, balance mutation, ledger entry and the replayable response. These statements use one checked-out connection. On success they commit together. If the injected failure occurs after the balance mutation, a rollback must remove every effect of that transaction so the operation can be retried safely.</p>
    <p>Concurrent requests add another question: what does the losing request observe after the winning transaction commits? A conflicting insert may wait. A later statement can read the committed response. The implementation must also preserve two distinct operations that happen to update the same account concurrently.</p>
    <p>In the lab, draw where uncertainty begins, where identity is checked and where the transaction starts and ends. Then compare the supplied implementation files. Use the disclosed PostgreSQL observations to inspect replay, payload conflicts, rollback and concurrent writes. Passing these cases supports those observations; it does not prove every possible schedule or exactly-once behavior for an external email, payment provider or other service.</p>
    <p className="muted small">Authored locally for this frontend demo; editorial review pending. This companion is not covered by the API lesson content hash. References: <a href="https://www.rfc-editor.org/rfc/rfc9110.html#name-idempotent-methods" target="_blank" rel="noreferrer">HTTP semantics</a> · <a href="https://www.postgresql.org/docs/current/tutorial-transactions.html" target="_blank" rel="noreferrer">PostgreSQL transactions</a> · <a href="https://node-postgres.com/features/transactions" target="_blank" rel="noreferrer">node-postgres transactions</a>.</p>
  </section>;
}
function ResponseTrace() {
  const marker = `trace-${useId().replace(/[^a-z0-9]/gi, '')}`;
  return <figure className="response-trace"><figcaption>One intended operation, two application requests</figcaption><svg className="sequence-diagram" viewBox="0 0 700 360" role="img" aria-label="Client sends a credit request to the API; PostgreSQL commits. The API response is lost. The client retries with the same key and receives the stored response."><defs><marker id={marker} markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6" fill="none" stroke="currentColor" /></marker></defs>{[['Client', 65], ['API', 350], ['PostgreSQL', 635]].map(([label, x]) => <g key={label}><text x={x} y="24" textAnchor="middle" fontSize="14" fill="currentColor">{label}</text><line x1={x} x2={x} y1="42" y2="350" stroke="currentColor" strokeOpacity=".2" strokeDasharray="4 5" /></g>)}<g fill="none" stroke="currentColor" strokeWidth="1.4" markerEnd={`url(#${marker})`}><path d="M65 80 H350" /><path d="M350 133 H635" /><path d="M635 175 H350" /><path d="M350 221 H95" strokeDasharray="5 5" /><path d="M65 272 H350" /><path d="M350 322 H65" /></g><g fontSize="12" fill="currentColor" textAnchor="middle"><text x="207" y="68">Credit request · key K</text><text x="492" y="121">Write + COMMIT</text><text x="492" y="163">Committed response</text><text x="207" y="209">Response lost after commit ×</text><text x="207" y="260">Application retry · same key K</text><text x="207" y="310">Read + replay stored response</text></g></svg><div className="trace-lines"><p><span>01</span> Client → API <b>Credit request · key K</b></p><p><span>02</span> API → PostgreSQL <b>Write + COMMIT</b></p><p><span>03</span> API ⇢ Client <b>Response lost after commit</b></p><p><span>04</span> Client → API <b>Retry · same key K</b></p><p><span>05</span> API → PostgreSQL → Client <b>Read + replay original response</b></p></div><small>The second request must replay the first operation, without another credit.</small></figure>;
}
