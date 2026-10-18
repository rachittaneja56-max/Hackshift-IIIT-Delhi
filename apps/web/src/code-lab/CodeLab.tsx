import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useApi } from '../app/context';
import { Link } from '../app/router';
import { ApiClientError } from '../lib/api';
import { sandboxApi, type SandboxFiles, type SandboxReport, type SandboxSession } from './api';
import './code-lab.css';

type Pending = { kind: 'start' | 'prompt' | 'visible' | 'submit' | 'edit'; id: string; prompt?: string; source?: string; sourceSha256?: string };
function readPending(key: string): Pending | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<Pending> | null;
    if (!value || !['start', 'prompt', 'visible', 'submit', 'edit'].includes(String(value.kind)) || typeof value.id !== 'string') return null;
    if (value.kind === 'prompt' && typeof value.prompt !== 'string') return null;
    if (value.kind === 'edit' && (typeof value.source !== 'string' || typeof value.sourceSha256 !== 'string')) return null;
    return value as Pending;
  } catch { return null; }
}
const short = (hash: string | null | undefined) => hash ? hash.slice(0, 12) : '—';
function errorText(error: unknown) { return error instanceof Error ? error.message : 'The request failed.'; }
async function hashSource(source: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
function remaining(expiresAt: string, now: number) { const seconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }
function verdictLabel(verdict: SandboxReport['verdict']) { return verdict === 'correct' ? 'Passed disclosed checks' : verdict === 'incorrect' ? 'Some checks need work' : verdict === 'timeout' ? 'Evaluation timed out' : 'Evaluation could not finish'; }

function simpleDiff(before: string, after: string) {
  if (before === after) return ['No source changes yet.'];
  const a = before.split('\n'), b = after.split('\n');
  let first = 0; while (first < a.length && first < b.length && a[first] === b[first]) first++;
  let ai = a.length - 1, bi = b.length - 1; while (ai >= first && bi >= first && a[ai] === b[bi]) { ai--; bi--; }
  return [`@@ lines ${first + 1} onward @@`, ...a.slice(first, ai + 1).map(line => `− ${line}`), ...b.slice(first, bi + 1).map(line => `+ ${line}`)];
}

function eventRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function formatBytes(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '';
  return value < 1024 ? `${value} bytes` : `${(value / 1024).toFixed(1)} KB`;
}
function toolEventSummary(event: { name: string; arguments: unknown; result: unknown }) {
  const args = eventRecord(event.arguments);
  const result = eventRecord(event.result);
  if (typeof result.error === 'string') return `${event.name.replaceAll('_', ' ')} could not complete.`;
  if (event.name === 'list_files') return `Listed ${Array.isArray(event.result) ? event.result.length : 'the'} challenge files.`;
  if (event.name === 'read_file') {
    const path = typeof result.path === 'string' ? result.path : typeof args.path === 'string' ? args.path : 'challenge source';
    const bytes = formatBytes(result.bytes);
    return `Inspected ${path}${bytes ? ` · ${bytes}` : ''}.`;
  }
  if (event.name === 'write_file') {
    const path = typeof result.path === 'string' ? result.path : typeof args.path === 'string' ? args.path : 'source file';
    const bytes = formatBytes(result.bytes ?? args.bytes);
    return `Updated ${path}${bytes ? ` · ${bytes}` : ''}.`;
  }
  if (event.name === 'run_visible_tests') {
    if (result.timedOut === true) return 'Visible tests timed out.';
    if (typeof result.infrastructureFailure === 'string') return 'Visible tests could not finish because of a sandbox issue.';
    const passed = typeof result.passed === 'number' ? result.passed : '?';
    const failed = typeof result.failed === 'number' ? result.failed : '?';
    return `Ran visible tests · ${passed} passed, ${failed} failed.`;
  }
  return 'Sandbox activity recorded.';
}

export function CodeLab() {
  const { api, userId } = useApi();
  const client = useMemo(() => sandboxApi(api), [api]);
  const pendingStorageKey = 'trajectoryos:sandbox:' + userId + ':pending';
  const storageKey = `trajectoryos:sandbox:${userId}`;
  const [availability, setAvailability] = useState<boolean | null>(null);
  const [session, setSession] = useState<SandboxSession | null>(null);
  const [files, setFiles] = useState<SandboxFiles | null>(null);
  const [report, setReport] = useState<SandboxReport | null>(null);
  const [selectedPath, setSelectedPath] = useState('src/rateLimiter.ts');
  const [sourceView, setSourceView] = useState<'current' | 'original' | 'diff'>('current');
  const [sourceSearch, setSourceSearch] = useState('');
  const [sourceDraft, setSourceDraft] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [terminalCommand, setTerminalCommand] = useState('');
  const [terminalNotice, setTerminalNotice] = useState('Only reviewed sandbox commands are available here. Type help to see them.');
  const [bottomPanel, setBottomPanel] = useState<'terminal' | 'patch' | 'observations'>('terminal');
  const [dockOpen, setDockOpen] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pending, setPending] = useState<Pending | null>(() => readPending(pendingStorageKey));
  const pendingRef = useRef(pending);
  const editorGutterRef = useRef<HTMLDivElement | null>(null);
  const workbenchRef = useRef<HTMLDivElement | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const lastFilesKey = useRef<string | null>(null);
  const updatePending = useCallback((next: Pending | null) => {
    pendingRef.current = next;
    setPending(next);
    try { if (next) localStorage.setItem(pendingStorageKey, JSON.stringify(next)); else localStorage.removeItem(pendingStorageKey); } catch {}
  }, [pendingStorageKey]);

  useEffect(() => {
    const updateFullscreen = () => setIsFullscreen(document.fullscreenElement === workbenchRef.current);
    document.addEventListener('fullscreenchange', updateFullscreen);
    return () => document.removeEventListener('fullscreenchange', updateFullscreen);
  }, []);

  const refresh = useCallback(async (id: string) => {
    const next = await client.session(id);
    setSession(next);
    const filesKey = `${next.id}:${next.currentSha256}`;
    if (filesKey !== lastFilesKey.current) {
      try { setFiles(await client.files(id)); lastFilesKey.current = filesKey; } catch (cause) { setError(errorText(cause)); }
    }
    const savedEdit = pendingRef.current;
    if (savedEdit?.kind === 'edit' && savedEdit.sourceSha256 !== next.currentSha256) setSourceDraft(savedEdit.source ?? '');
    if (savedEdit?.kind === 'edit' && next.status === 'ready' && savedEdit.sourceSha256 === next.currentSha256) {
      updatePending(null); setSourceDraft(null); setError(null);
    }
    if (savedEdit?.kind === 'edit' && next.status === 'error') setError('The sandbox could not save this edit. Your draft remains visible so you can copy it before starting a new session.');
    if (next.status === 'submitted') setReport(await client.report(id));
  }, [client, updatePending]);

  useEffect(() => {
    let active = true;
    void client.availability().then(value => { if (active) setAvailability(value.available); }, cause => { if (active) setError(errorText(cause)); });
    const saved = localStorage.getItem(storageKey);
    if (saved) void refresh(saved).catch(cause => {
      if (!active) return;
      if (cause instanceof ApiClientError && cause.status === 404) {
        localStorage.removeItem(storageKey);
        setSession(null);
        setFiles(null);
        setReport(null);
        updatePending(null);
        void client.challengeFiles().then(value => {
          if (!active) return;
          setFiles(value);
          lastFilesKey.current = `challenge:${value.currentSha256}`;
          setError(null);
        }).catch(() => undefined);
        return;
      }
      setError(errorText(cause));
    });
    else void client.challengeFiles().then(value => {
      if (active && !localStorage.getItem(storageKey)) {
        setFiles(value);
        lastFilesKey.current = `challenge:${value.currentSha256}`;
      }
    }).catch(cause => { if (active) setError(errorText(cause)); });
    return () => { active = false; };
  }, [client, refresh, storageKey, updatePending]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (session && !['submitted', 'expired', 'error'].includes(session.status)) void refresh(session.id).catch(cause => setError(errorText(cause)));
    }, 3000);
    return () => window.clearInterval(timer);
  }, [refresh, session]);

  const execute = async (action: Pending) => {
    let keepPendingEdit = false;
    setWorking(true); setError(null); updatePending(action);
    try {
      if (action.kind === 'start') {
        const next = await client.start(action.id);
        localStorage.setItem(storageKey, next.id);
        lastFilesKey.current = null;
        setSession(next); setSourceDraft(null); setReport(null);
        const initialFiles = await client.files(next.id);
        setFiles(initialFiles);
        lastFilesKey.current = `${next.id}:${initialFiles.currentSha256}`;
      } else if (action.kind === 'edit' && session) {
        const next = await client.saveSource(session.id, action.id, action.source ?? '');
        setSession(next);
        if (next.status === 'processing') keepPendingEdit = true;
        else if (next.currentSha256 === action.sourceSha256) setSourceDraft(null);
        else if (next.status === 'error') setError('The sandbox could not save this edit. Your draft remains visible so you can copy it before starting a new session.');
      } else if (session) {
        if (action.kind === 'prompt') {
          await client.send(session.id, action.id, action.prompt ?? '');
          setPrompt('');
        } else if (action.kind === 'visible') await client.visible(session.id, action.id);
        else if (action.kind === 'submit') await client.submit(session.id, action.id);
        await refresh(session.id);
      }
      if (!keepPendingEdit) updatePending(null);
    } catch (cause) { setError(errorText(cause)); }
    finally { setWorking(false); }
  };

  const selected = files?.files.find(item => item.path === selectedPath);
  const fileGroups = files?.files.reduce<Array<{ folder: string; files: SandboxFiles['files'] }>>((groups, file) => {
    const folder = file.path.includes('/') ? file.path.split('/')[0]! : 'root';
    const group = groups.find(item => item.folder === folder);
    if (group) group.files.push(file);
    else groups.push({ folder, files: [file] });
    return groups;
  }, []) ?? [];
  const current = selected?.content ?? '';
  const editableCurrent = files?.files.find(item => item.path === 'src/rateLimiter.ts')?.content ?? '';
  const editableValue = sourceDraft ?? editableCurrent;
  const editorValue = selectedPath === 'src/rateLimiter.ts' ? editableValue : current;
  const editorLineCount = Math.max(1, editorValue.split(/\r?\n/).length);
  const hasUnsavedChanges = sourceDraft !== null && sourceDraft !== editableCurrent;
  const original = selectedPath === 'src/rateLimiter.ts' ? files?.starterSource ?? '' : current;
  const sourceValue = sourceView === 'diff' ? simpleDiff(original, editorValue).join('\n') : sourceView === 'original' ? original : editorValue || 'Source will appear when the sandbox is ready.';
  const sourceLines = sourceValue.split(/\r?\n/).map((line, index) => ({ line, index })).filter(item => !sourceSearch || item.line.toLowerCase().includes(sourceSearch.toLowerCase()));
  const canWork = session?.status === 'ready' && Date.parse(session.expiresAt) > now && !working;
  const canRun = canWork && !hasUnsavedChanges;
  const statusText = pending?.kind === 'edit' ? session?.status === 'processing' ? 'Saving candidate edits' : 'Candidate edits need saving' : session?.status === 'creating' ? 'Starting isolated sandbox' : session?.status === 'processing' ? 'Assistant is working' : session?.status === 'freezing' ? 'Saving submission' : session?.status === 'grading' ? 'Running final checks' : session?.status === 'submitted' ? 'Results ready' : session?.status === 'expired' ? 'Session expired' : session?.status === 'error' ? 'Session needs attention' : session?.status === 'ready' ? 'Ready' : 'Not started';

  const saveSource = async () => {
    if (!session || !hasUnsavedChanges || !canWork) return;
    const source = editableValue;
    const sourceSha256 = await hashSource(source);
    void execute({ kind: 'edit', id: crypto.randomUUID(), source, sourceSha256 });
  };

  const startChallenge = () => {
    setDockOpen(true);
    const workbench = workbenchRef.current;
    if (workbench?.requestFullscreen) void workbench.requestFullscreen().catch(() => setIsFullscreen(false));
    void execute({ kind: 'start', id: crypto.randomUUID() });
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement === workbenchRef.current) {
      void document.exitFullscreen().catch(() => setIsFullscreen(false));
      return;
    }
    const workbench = workbenchRef.current;
    if (workbench?.requestFullscreen) void workbench.requestFullscreen().catch(() => setIsFullscreen(false));
  };

  const runTerminalCommand = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const command = terminalCommand.trim();
    if (!command) return;
    setTerminalCommand('');
    if (command === 'help') {
      setTerminalNotice('Available command: npm run test:visible. Hidden tests run only after final submission.');
      return;
    }
    if (command !== 'npm run test:visible') {
      setTerminalNotice(`Command not available: ${command}. Type help to see the reviewed command.`);
      return;
    }
    if (!canRun) {
      setTerminalNotice('Start a session and wait until the sandbox is ready before running tests.');
      return;
    }
    if ((session?.visibleRunsRemaining ?? 0) < 1) {
      setTerminalNotice('The visible test run limit has been reached for this session.');
      return;
    }
    setTerminalNotice(`$ ${command}`);
    setBottomPanel('terminal');
    void execute({ kind: 'visible', id: crypto.randomUUID() });
  };

  return <main id="main-content" tabIndex={-1} className="code-lab page">
    <div className="code-lab-top"><div><span className="eyebrow">Engineering lab / AI debugging</span><h1>Rate limiter lab</h1></div><Link className="text-action" href="/lab">← Engineering Lab</Link></div>
    <details className="code-lab-brief"><summary>Challenge brief</summary><div><p>Implement one fixed window per API key, aligned to multiples of the window length. Denied requests must not consume capacity. A denied decision reports the whole seconds until reset, rounded up.</p><p>You and the assistant can edit only <code>src/rateLimiter.ts</code>. Visible tests reveal some faults; hidden tests run only after final submission.</p></div></details>
    {availability === false && <div className="code-lab-alert" role="status">This lab is not available yet. Server-side setup is incomplete.</div>}
    {error && <div className="code-lab-alert" role="alert">{error}{pending && <button onClick={() => void execute(pending)} disabled={working}>Retry the same request</button>}</div>}
    {session?.status === 'creating' && <div className="code-lab-progress" role="status"><strong>Preparing your isolated workspace.</strong> The starter code is available now; editing, tests, and prompts unlock when setup finishes.</div>}
    {pending?.kind === 'edit' && session?.status === 'processing' && !error && <div className="code-lab-progress" role="status"><strong>Saving your code to the sandbox.</strong> Your edits will be available to the assistant and test runner when the save completes.</div>}
    {pending?.kind === 'edit' && session?.status === 'ready' && pending.sourceSha256 !== session.currentSha256 && !error && <div className="code-lab-alert" role="status">Your edit is still in this browser and has not reached the sandbox yet. <button onClick={() => void execute(pending)} disabled={working}>Retry saving code</button></div>}
    {pending && !error && pending.kind !== 'edit' && <div className="code-lab-alert" role="status">An action may still be processing. Its recovery copy is saved in this browser; retrying repeats the same action safely. <button onClick={() => void execute(pending)} disabled={working}>Retry the action</button></div>}
    {session?.status === 'expired' && <div className="code-lab-alert" role="status">This session expired. Start a new session to continue.</div>}
    {session?.challengeVersion === 1 && <div className="code-lab-alert" role="status">This saved session uses a retired challenge and cannot continue. Its submitted report remains available; start a new session to continue.</div>}
    {session?.status === 'error' && <div className="code-lab-alert" role="status">The session stopped before it could finish. Your recorded messages and observations remain visible.</div>}
    <div className="code-lab-workbench" ref={workbenchRef}>
      <aside className="code-lab-sidebar" aria-label="Project explorer">
        <div className="code-lab-sidebar-heading"><span>EXPLORER</span><span>TRAJECTORYOS</span></div>
        <nav aria-label="Challenge files" className="code-lab-files">
          {fileGroups.length ? fileGroups.map(group => <div className="code-lab-file-group" key={group.folder}>
            <div className="code-lab-folder"><span aria-hidden="true">⌄</span>{group.folder}</div>
            {group.files.map(item => {
              const extension = item.path.split('.').at(-1)?.toUpperCase() ?? 'FILE';
              const name = item.path.split('/').at(-1) ?? item.path;
              return <button key={item.path} className={selectedPath === item.path ? 'selected' : ''} aria-current={selectedPath === item.path ? 'page' : undefined} title={item.editable ? 'Editable source' : 'Read-only challenge file'} onClick={() => setSelectedPath(item.path)}>
                <span className={`code-lab-file-icon ${extension.toLowerCase()}`}>{extension === 'TS' ? 'TS' : extension === 'JSON' ? '{}' : extension.slice(0, 2)}</span><span className="code-lab-file-name">{name}</span>{item.changed && <span className="code-lab-file-changed" aria-label="Changed">●</span>}
              </button>;
            })}
          </div>) : <p className="code-lab-empty-files">Loading project files…</p>}
        </nav>
        <div className="code-lab-sidebar-status"><span className={`code-lab-status-dot ${session?.status === 'ready' ? 'ready' : ''}`} />{statusText}<small>{session ? `${remaining(session.expiresAt, now)} left · ${session.promptsRemaining} prompts` : availability === false ? 'Sandbox unavailable' : '20 minute session · 5 prompts'}</small></div>
      </aside>

      <section className="code-lab-center" aria-label="Code editor and terminal">
        <div className="code-lab-center-toolbar">
          <div className="code-lab-breadcrumb"><span>workspace</span><span>/</span><strong>{selectedPath}</strong></div>
          <div className="code-lab-actions">
            {(!session || ['expired', 'error', 'submitted'].includes(session.status)) && <button className="primary" disabled={working || availability !== true} onClick={startChallenge}>{working && pending?.kind === 'start' ? 'Starting…' : 'Start session'}</button>}
            {session?.status === 'creating' && <button className="primary" disabled>Preparing sandbox…</button>}
            <button className="code-lab-run-button" disabled={!canRun || (session?.visibleRunsRemaining ?? 0) < 1} onClick={() => void execute({ kind: 'visible', id: crypto.randomUUID() })}><span aria-hidden="true">▶</span> Run tests</button>
            <button className="primary" disabled={!canRun} onClick={() => void execute({ kind: 'submit', id: crypto.randomUUID() })}>Submit</button>
            <button type="button" onClick={() => { if (dockOpen) setDockOpen(false); else { setBottomPanel('terminal'); setDockOpen(true); } }} aria-expanded={dockOpen}>{dockOpen ? 'Hide panel' : 'Open terminal'}</button>
            <button type="button" onClick={toggleFullscreen} aria-label={isFullscreen ? 'Exit fullscreen editor' : 'Enter fullscreen editor'}>{isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}</button>
          </div>
        </div>

        <div className="code-lab-editor-tabs">
          <div className="code-lab-active-file"><span className="code-lab-file-icon ts">TS</span>{selectedPath}</div>
          <div className="code-lab-editor-tools">
            {(['current', 'original', 'diff'] as const).map(view => <button key={view} aria-pressed={sourceView === view} onClick={() => setSourceView(view)}>{view}</button>)}
            {!(selected?.editable && sourceView === 'current') && <label className="code-lab-search"><input aria-label="Search current file" type="search" value={sourceSearch} onChange={event => setSourceSearch(event.target.value)} placeholder="Find" /></label>}
            {session && (hasUnsavedChanges || selected?.editable && sourceView === 'current') && <div className="code-lab-editor-actions">
              {hasUnsavedChanges && <button type="button" onClick={() => setSourceDraft(null)} disabled={!canWork || pending?.kind === 'edit'}>Discard</button>}
              <button type="button" className="primary" onClick={() => void saveSource()} disabled={!canWork || !hasUnsavedChanges || pending?.kind === 'edit'}>Save</button>
            </div>}
          </div>
        </div>

        <div className="code-lab-source">
          {selected?.editable && sourceView === 'current' ? <div className="code-lab-code-editor-shell">
            <div className="code-lab-line-gutter" ref={editorGutterRef} aria-hidden="true">{Array.from({ length: editorLineCount }, (_, index) => <span key={index}>{index + 1}</span>)}</div>
            <textarea className="code-lab-code-editor" aria-label={`Edit ${selectedPath}`} value={editorValue} onChange={event => setSourceDraft(event.target.value)} onScroll={event => { if (editorGutterRef.current) editorGutterRef.current.scrollTop = event.currentTarget.scrollTop; }} readOnly={!canWork || pending?.kind === 'edit'} maxLength={32_768} spellCheck={false} autoCapitalize="off" autoCorrect="off" wrap="off" />
          </div> :
            <pre tabIndex={0}><code>{files ? sourceLines.length ? sourceLines.map(({ line, index }) => <span className="code-lab-line" key={index}><span aria-hidden="true">{index + 1}</span><span>{line || ' '}</span></span>) : 'No matching lines.' : 'Loading challenge source…'}</code></pre>}
          {!session && selected?.editable && <small className="code-lab-editor-hint">Preview only · start a session to edit in the sandbox.</small>}
          {hasUnsavedChanges && <small className="code-lab-editor-hint">Save your changes before asking the assistant or running tests.</small>}
        </div>

        {dockOpen && <section className="code-lab-dock" aria-label="Sandbox terminal and results">
          <div className="code-lab-dock-tabs">
            <div>{(['terminal', 'observations', 'patch'] as const).map(panel => <button key={panel} className={bottomPanel === panel ? 'active' : ''} onClick={() => setBottomPanel(panel)}>{panel === 'terminal' ? 'TERMINAL' : panel === 'observations' ? 'TEST RESULTS' : 'PATCH'}</button>)}</div>
            <div className="code-lab-dock-meta">{bottomPanel === 'terminal' && <span>{session ? `${session.visibleRunsRemaining} test runs left` : 'sandbox console'}</span>}<button type="button" className="code-lab-dock-close" aria-label="Close terminal panel" onClick={() => setDockOpen(false)}>×</button></div>
          </div>
          {bottomPanel === 'terminal' && <div className="code-lab-terminal">
            <div className="code-lab-terminal-output" role="log" aria-live="polite">
              {terminalNotice && !terminalNotice.startsWith('$ ') && <p className="code-lab-terminal-notice">{terminalNotice}</p>}
              {session?.visibleTests?.length ? session.visibleTests.map((run, index) => <div className="code-lab-terminal-run" key={run.id}>
                <div><span className="code-lab-terminal-prompt">$</span> npm run test:visible <span className="code-lab-terminal-muted">· run {index + 1}</span></div>
                {run.status === 'running' ? <p>Running reviewed visible tests…</p> : <>
                  <p className={run.status === 'completed' && (run.observation?.failed ?? 0) === 0 ? 'terminal-pass' : 'terminal-fail'}>{run.status === 'completed' ? `${run.observation?.passed ?? '?'} passed · ${run.observation?.failed ?? '?'} failed` : run.status === 'timeout' ? 'Test command timed out.' : 'Test command could not finish.'}</p>
                  {run.observation?.stdout && <pre>{run.observation.stdout}</pre>}{run.observation?.stderr && <pre className="terminal-stderr">{run.observation.stderr}</pre>}
                </>}
              </div>) : <p>Run <code>npm run test:visible</code> to execute the reviewed test suite.</p>}
            </div>
            <form className="code-lab-terminal-form" onSubmit={runTerminalCommand}><span aria-hidden="true">$</span><input aria-label="Sandbox command" value={terminalCommand} onChange={event => setTerminalCommand(event.target.value)} placeholder="Type a reviewed command (help)" autoComplete="off" spellCheck={false} /><button type="submit" disabled={!terminalCommand.trim() || working}>Run</button></form>
          </div>}
          {bottomPanel === 'patch' && <pre className="code-lab-dock-content">{files ? simpleDiff(files.starterSource, editableValue).join('\n') : 'No source changes yet.'}</pre>}
          {bottomPanel === 'observations' && <div className="code-lab-dock-content code-lab-observations">{session?.visibleTests?.length ? session.visibleTests.map((run, index) => <details key={run.id} open={index === session.visibleTests!.length - 1}><summary>Run {index + 1} · {run.status} · {run.observation ? `${run.observation.passed ?? '?'} passed, ${run.observation.failed ?? '?'} failed` : 'Waiting for output'}</summary><p>Source {short(run.sourceSha256)}</p></details>) : <p>No visible test runs yet.</p>}</div>}
        </section>}
      </section>

      <aside className="code-lab-chat" aria-label="AI coding assistant">
        <div className="code-lab-chat-heading"><div><span className="code-lab-chat-presence" />AI ASSISTANT</div><small>{session?.promptsRemaining ?? 5} prompts left</small></div>
        <div className="code-lab-messages" aria-live="polite">{session?.turns?.length ? session.turns.map(turn => <article key={turn.id} className="code-lab-turn">
          <div className="code-lab-message learner"><small>YOU · PROMPT {turn.ordinal}</small><p>{turn.prompt}</p></div>
          <div className="code-lab-message assistant"><small>ASSISTANT · {turn.status === 'completed' ? 'DONE' : turn.status === 'processing' ? 'WORKING' : 'NEEDS ATTENTION'}</small>{turn.response ? <p>{turn.response}</p> : turn.status === 'processing' ? <p>Inspecting the source and working on your request…</p> : <p>The assistant or a tool could not finish. This accepted prompt still counts.</p>}{turn.toolEvents.map((event, index) => <div className="code-lab-tool-event" key={index}><span aria-hidden="true">{event.name === 'write_file' ? '↳' : event.name === 'run_visible_tests' ? '✓' : event.name === 'read_file' ? '⌕' : '·'}</span>{toolEventSummary(event)}</div>)}</div>
        </article>) : <div className="code-lab-chat-empty"><span>✳</span><p>Ask the assistant to inspect the implementation, check a hypothesis, or make a focused repair.</p><small>Edits appear in the editor and use one of your five prompts.</small></div>}</div>
        <form onSubmit={event => { event.preventDefault(); if (prompt.trim() && canRun && (session?.promptsRemaining ?? 0) > 0) void execute({ kind: 'prompt', id: crypto.randomUUID(), prompt: prompt.trim() }); }}>
          <textarea aria-label="Your instruction" maxLength={4000} value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Ask about this implementation…" disabled={!canRun || (session?.promptsRemaining ?? 0) < 1} />
          {hasUnsavedChanges && <small className="code-lab-editor-hint">Save code before asking for an AI edit.</small>}
          <div><small>{prompt.length}/4000</small><button className="primary" disabled={!canRun || !prompt.trim() || (session?.promptsRemaining ?? 0) < 1}>Send ↗</button></div>
        </form>
      </aside>
    </div>
    {report && <section className="code-lab-report"><span className="eyebrow">Final report</span><h2>{verdictLabel(report.verdict)}</h2><p>{report.hiddenTests.passed ?? '?'} passed · {report.hiddenTests.failed ?? '?'} failed</p><p>Your submitted patch, assistant actions, visible observations, and the final sandbox check are saved with this result.</p><details><summary>Test output and technical details</summary><pre>{report.hiddenTests.stdout}{report.hiddenTests.stderr}</pre><p>Source SHA-256 {report.sourceHash}</p><p>{report.execution.provider} · SDK {report.execution.sdk} · {report.execution.runner} · {report.execution.network}</p></details><p className="muted">{report.limits}</p></section>}
  </main>;
}
