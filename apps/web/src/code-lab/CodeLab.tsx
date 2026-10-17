import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '../app/context';
import { Link } from '../app/router';
import { sandboxApi, type SandboxFiles, type SandboxReport, type SandboxSession } from './api';
import './code-lab.css';

type Pending = { kind: 'start' | 'prompt' | 'visible' | 'submit'; id: string; prompt?: string };
const short = (hash: string | null | undefined) => hash ? hash.slice(0, 12) : '—';
function errorText(error: unknown) { return error instanceof Error ? error.message : 'The request failed.'; }
function remaining(expiresAt: string, now: number) { const seconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }

function simpleDiff(before: string, after: string) {
  if (before === after) return ['No source changes yet.'];
  const a = before.split('\n'), b = after.split('\n');
  let first = 0; while (first < a.length && first < b.length && a[first] === b[first]) first++;
  let ai = a.length - 1, bi = b.length - 1; while (ai >= first && bi >= first && a[ai] === b[bi]) { ai--; bi--; }
  return [`@@ lines ${first + 1} onward @@`, ...a.slice(first, ai + 1).map(line => `− ${line}`), ...b.slice(first, bi + 1).map(line => `+ ${line}`)];
}

export function CodeLab() {
  const { api, userId } = useApi();
  const client = useMemo(() => sandboxApi(api), [api]);
  const storageKey = `trajectoryos:sandbox:${userId}`;
  const [availability, setAvailability] = useState<boolean | null>(null);
  const [session, setSession] = useState<SandboxSession | null>(null);
  const [files, setFiles] = useState<SandboxFiles | null>(null);
  const [report, setReport] = useState<SandboxReport | null>(null);
  const [selectedPath, setSelectedPath] = useState('src/rateLimiter.ts');
  const [sourceView, setSourceView] = useState<'current' | 'original' | 'diff'>('current');
  const [prompt, setPrompt] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const lastFilesHash = useRef<string | null>(null);

  const refresh = useCallback(async (id: string) => {
    const next = await client.session(id);
    setSession(next);
    if (['ready', 'processing', 'freezing', 'grading', 'submitted'].includes(next.status) && next.currentSha256 !== lastFilesHash.current) {
      try { setFiles(await client.files(id)); lastFilesHash.current = next.currentSha256; } catch (cause) { if (next.status === 'ready') setError(errorText(cause)); }
    }
    if (next.status === 'submitted') setReport(await client.report(id));
  }, [client]);

  useEffect(() => {
    let active = true;
    void client.availability().then(value => { if (active) setAvailability(value.available); }, cause => { if (active) setError(errorText(cause)); });
    const saved = localStorage.getItem(storageKey);
    if (saved) void refresh(saved).catch(cause => { if (active) { localStorage.removeItem(storageKey); setError(errorText(cause)); } });
    return () => { active = false; };
  }, [client, refresh, storageKey]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (session && !['submitted', 'expired', 'error'].includes(session.status)) void refresh(session.id).catch(cause => setError(errorText(cause)));
    }, 3000);
    return () => window.clearInterval(timer);
  }, [refresh, session]);

  const execute = async (action: Pending) => {
    setWorking(true); setError(null); setPending(action);
    try {
      if (action.kind === 'start') {
        const next = await client.start(action.id);
        localStorage.setItem(storageKey, next.id);
        lastFilesHash.current = null;
        setSession(next); setFiles(null); setReport(null);
      } else if (session) {
        if (action.kind === 'prompt') {
          await client.send(session.id, action.id, action.prompt ?? '');
          setPrompt('');
        } else if (action.kind === 'visible') await client.visible(session.id, action.id);
        else if (action.kind === 'submit') await client.submit(session.id, action.id);
        await refresh(session.id);
      }
      setPending(null);
    } catch (cause) { setError(errorText(cause)); }
    finally { setWorking(false); }
  };

  const selected = files?.files.find(item => item.path === selectedPath);
  const current = selected?.content ?? '';
  const original = selectedPath === 'src/rateLimiter.ts' ? files?.starterSource ?? '' : current;
  const canWork = session?.status === 'ready' && Date.parse(session.expiresAt) > now && !working;
  const statusText = session?.status === 'creating' ? 'Preparing sandbox' : session?.status === 'processing' ? 'Processing' : session?.status === 'freezing' ? 'Freezing submission' : session?.status === 'grading' ? 'Running hidden tests' : session?.status ?? 'Not started';

  return <main id="main-content" tabIndex={-1} className="code-lab page">
    <div className="code-lab-top"><div><span className="eyebrow">Engineering lab / AI debugging</span><h1>Investigate a rate limiter</h1><p className="lead">Direct a limited coding assistant. Inspect its actual edits and test evidence before you submit.</p></div><Link className="text-action" href="/lab">← Engineering Lab</Link></div>
    <section className="code-lab-intro"><div><h2>The contract</h2><p>Implement one fixed window per API key, aligned to multiples of the window length. Denied requests must not consume capacity. A denied decision reports the whole seconds until reset, rounded up.</p><p className="muted">The assistant can edit only <code>src/rateLimiter.ts</code>. Visible tests reveal some faults; hidden tests run only after submission in a fresh sandbox.</p></div><aside><span className="eyebrow">Curated starting example</span><p>“Check the boundary condition first.” This is an example investigation prompt, not a model response or executed repair.</p></aside></section>
    <div className="code-lab-controls"><div className="code-lab-status"><strong>{statusText}</strong><span>{session ? `Expires in ${remaining(session.expiresAt, now)}` : '20 minute session'}</span><span>{session ? `${session.promptsRemaining} prompts remaining` : '5 prompts available'}</span></div><div className="code-lab-actions"><button className="primary" disabled={working || availability !== true || !!session && !['expired', 'error', 'submitted'].includes(session.status)} onClick={() => void execute({ kind: 'start', id: crypto.randomUUID() })}>Start session</button><button disabled={!canWork || (session?.visibleRunsRemaining ?? 0) < 1} onClick={() => void execute({ kind: 'visible', id: crypto.randomUUID() })}>Run visible tests</button><button disabled={!canWork} onClick={() => void execute({ kind: 'submit', id: crypto.randomUUID() })}>Final submit</button></div></div>
    {availability === false && <div className="code-lab-alert" role="status">This lab is unavailable. The server needs the sandbox feature flag and provider credentials.</div>}
    {error && <div className="code-lab-alert" role="alert">{error}{pending && <button onClick={() => void execute(pending)} disabled={working}>Retry the same request</button>}</div>}
    {session?.status === 'expired' && <div className="code-lab-alert" role="status">This session expired. Start a new session to continue.</div>}
    {session?.status === 'error' && <div className="code-lab-alert" role="status">The session stopped after an infrastructure error. Your recorded messages and observations remain visible.</div>}
    <div className="code-lab-grid"><section className="code-lab-editor"><div className="code-lab-panel-title"><h2>Repository</h2><span>Read-only viewer · AI tools edit one file</span></div><div className="code-lab-file-area"><nav aria-label="Challenge files" className="code-lab-files">{files?.files.map(item => <button key={item.path} className={selectedPath === item.path ? 'selected' : ''} onClick={() => setSelectedPath(item.path)}><span>{item.path}</span><small>{item.changed ? 'Changed' : item.editable ? 'AI editable' : 'Read-only'}</small></button>) ?? <p className="muted">Start a session to inspect source.</p>}</nav><div className="code-lab-source"><div className="code-lab-source-toolbar"><strong>{selectedPath}</strong><div>{(['current', 'original', 'diff'] as const).map(view => <button key={view} aria-pressed={sourceView === view} onClick={() => setSourceView(view)}>{view}</button>)}</div></div><pre tabIndex={0}><code>{sourceView === 'diff' ? simpleDiff(original, current).join('\n') : sourceView === 'original' ? original : current || 'Source will appear when the sandbox is ready.'}</code></pre></div></div></section>
      <section className="code-lab-chat"><div className="code-lab-panel-title"><h2>AI coding assistant</h2><span>{session?.turns?.at(-1)?.model ?? 'Model shown after first turn'}</span></div><div className="code-lab-messages" aria-live="polite">{session?.turns?.length ? session.turns.map(turn => <article key={turn.id} className="code-lab-turn"><div className="code-lab-message learner"><small>Prompt {turn.ordinal} · learner</small><p>{turn.prompt}</p></div><div className="code-lab-message assistant"><small>{turn.model} · {turn.status}</small>{turn.response ? <p>{turn.response}</p> : turn.status === 'processing' ? <p>Processing your request…</p> : <p>The model or a tool failed. This accepted prompt still counts.</p>}{turn.toolEvents.map((event, index) => <details key={index}><summary>{event.name === 'write_file' ? 'Source changed' : event.name === 'run_visible_tests' ? 'Visible tests executed' : event.name === 'read_file' ? 'File read' : 'Files listed'}</summary><pre>{JSON.stringify({ arguments: event.arguments, result: event.result }, null, 2)}</pre></details>)}</div></article>) : <p className="muted">Ask the assistant to inspect a file, test a hypothesis, or repair a defect. Each accepted message uses one of five prompts.</p>}</div><form onSubmit={event => { event.preventDefault(); if (prompt.trim() && canWork && (session?.promptsRemaining ?? 0) > 0) void execute({ kind: 'prompt', id: crypto.randomUUID(), prompt: prompt.trim() }); }}><label htmlFor="code-lab-prompt">Your instruction</label><textarea id="code-lab-prompt" maxLength={4000} value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Check whether requests crossing a fixed-window boundary are handled correctly." disabled={!canWork || (session?.promptsRemaining ?? 0) < 1} /><div><small>{prompt.length}/4000 · {session?.promptsRemaining ?? 5} prompts remaining</small><button className="primary" disabled={!canWork || !prompt.trim() || (session?.promptsRemaining ?? 0) < 1}>Send prompt</button></div></form></section></div>
    <div className="code-lab-results"><section><h2>Visible observations</h2><p className="muted">Expected: exact reset boundaries open, API keys keep separate quotas, and denial gives a positive rounded delay. Observed assertions and pass counts come from the E2B test output below.</p>{session?.visibleTests?.length ? session.visibleTests.map(run => <details key={run.id} open={run.id === session.visibleTests?.at(-1)?.id}><summary>{run.status} · {run.observation ? `${run.observation.passed ?? '?'} passed, ${run.observation.failed ?? '?'} failed` : 'Running'} · source {short(run.sourceSha256)}</summary><pre>{run.observation ? `${run.observation.stdout}\n${run.observation.stderr}` : 'Waiting for E2B results.'}</pre></details>) : <p className="muted">No visible tests have run yet.</p>}</section><section><h2>Latest patch</h2><pre>{files ? simpleDiff(files.starterSource, files.files.find(item => item.path === 'src/rateLimiter.ts')?.content ?? files.starterSource).join('\n') : 'No source changes yet.'}</pre></section></div>
    {report && <section className="code-lab-report"><span className="eyebrow">Persisted final report</span><h2>Hidden result: {report.verdict.replaceAll('_', ' ')}</h2><p>{report.hiddenTests.passed ?? '?'} passed · {report.hiddenTests.failed ?? '?'} failed · source SHA-256 {report.sourceHash}</p><p>Submitted patch, {report.promptCount} prompt{report.promptCount === 1 ? '' : 's'}, model tool events, visible observations and a fresh E2B grading observation are recorded above and below.</p><details><summary>Hidden-test output and execution details</summary><pre>{report.hiddenTests.stdout}{report.hiddenTests.stderr}</pre><p>{report.execution.provider} · SDK {report.execution.sdk} · {report.execution.runner} · {report.execution.network}</p></details><p className="muted">{report.limits}</p></section>}
  </main>;
}