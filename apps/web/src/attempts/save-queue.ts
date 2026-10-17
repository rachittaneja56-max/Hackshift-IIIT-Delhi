import { SubmissionReadyArtifactSchema, type Artifact, type AttemptDto, type EvaluationDto } from '@trajectoryos/contracts';
import { ApiClientError, type ApiClient } from '../lib/api.ts';
import { artifactError } from '../lib/scenes.ts';
export const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export type SaveState = 'Saved' | 'Unsaved' | 'Saving' | 'Locally recovered' | 'Offline' | 'Conflict' | 'Frozen';
export class SaveQueue {
  server: AttemptDto;
  local: Artifact;
  state: SaveState = 'Saved';
  error: Error | null = null;
  conflict: AttemptDto | null = null;
  conflictBase: Artifact | null = null;
  submitting = false;
  submissionUnknown = false;
  private active: Promise<AttemptDto> | null = null;
  private uncertain: { base: AttemptDto; sent: Artifact } | null = null;
  private timer?: ReturnType<typeof setTimeout>;
  private listeners = new Set<() => void>();
  private disposed = false;
  constructor(attempt: AttemptDto, private api: Pick<ApiClient, 'save' | 'attempt' | 'submit' | 'evaluation'>, private recover: (artifact: Artifact, base: AttemptDto) => void) { this.server = attempt; this.local = attempt.artifact; if (attempt.status !== 'draft') this.state = 'Frozen'; }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  notify = () => { if (!this.disposed) this.listeners.forEach(fn => fn()); };
  edit(artifact: Artifact) {
    if (this.disposed || this.submitting || this.submissionUnknown || this.server.status !== 'draft') return;
    this.local = artifact; this.recover(artifact, this.server);
    if (this.state !== 'Conflict') { this.state = 'Unsaved'; this.error = null; clearTimeout(this.timer); this.timer = setTimeout(() => { void this.flush().catch(() => {}); }, 1000); }
    this.notify();
  }
  restore(artifact: Artifact) { this.local = artifact; this.state = 'Locally recovered'; this.notify(); }
  async reconcile() {
    if (!this.uncertain) return;
    const { base, sent } = this.uncertain;
    const current = await this.api.attempt(base.id);
    this.uncertain = null;
    if (current.status !== 'draft') { this.server = current; this.state = 'Frozen'; this.notify(); throw new Error('This attempt is already submitted. Local recovery is retained.'); }
    if (current.revision === base.revision && same(current.artifact, base.artifact)) { this.server = current; return; }
    if (current.revision === base.revision + 1 && same(current.artifact, sent)) { this.server = current; return; }
    this.setConflict(current, base.artifact); throw new Error('The server draft changed. Compare before reapplying your work.');
  }
  private setConflict(current: AttemptDto, base: Artifact) { this.conflict = current; this.conflictBase = base; this.state = 'Conflict'; this.notify(); }
  async flush(): Promise<AttemptDto> {
    clearTimeout(this.timer);
    if (this.active) return this.active;
    if (this.disposed) throw new Error('This editor session has closed.');
    if (this.submissionUnknown) throw new Error('Check the uncertain submission before editing or saving again.');
    if (this.state === 'Conflict') throw new Error('Resolve the revision conflict before saving.');
    if (this.server.status !== 'draft') return this.server;
    this.active = this.drain().finally(() => { this.active = null; });
    return this.active;
  }
  private async drain(): Promise<AttemptDto> {
    try {
      await this.reconcile();
      while (!this.disposed && !same(this.local, this.server.artifact)) {
        const base = this.server, sent = structuredClone(this.local);
        const invalid = artifactError(sent, base.revision); if (invalid) throw new Error(invalid);
        this.state = 'Saving'; this.error = null; this.notify();
        try {
          const saved = await this.api.save(base.id, base.revision, sent);
          if (saved.id !== base.id || saved.revision !== base.revision + 1 || !same(saved.artifact, sent)) throw new ApiClientError('The save acknowledgement did not match the sent artifact.', 200, 'INVALID_RESPONSE');
          this.server = saved; // Never replace local: edits may have arrived during the request.
          this.recover(this.local, saved);
        } catch (error) {
          if (error instanceof ApiClientError && error.code === 'REVISION_CONFLICT') { this.uncertain = { base, sent }; const current = await this.api.attempt(base.id); this.uncertain = null; this.setConflict(current, base.artifact); }
          else if (error instanceof ApiClientError && error.code === 'ATTEMPT_LOCKED') { this.server = await this.api.attempt(base.id); this.state = 'Frozen'; }
          else if (!(error instanceof ApiClientError) || error.status === 0 || error.status >= 500 || error.code === 'INVALID_RESPONSE') { this.uncertain = { base, sent }; this.state = 'Offline'; }
          throw error;
        }
      }
      if (this.server.status === 'draft') this.state = 'Saved';
      this.error = null; this.notify(); return this.server;
    } catch (error) { this.error = error instanceof Error ? error : new Error('Save failed.'); if (!['Conflict', 'Offline', 'Frozen'].includes(this.state)) this.state = 'Unsaved'; this.notify(); throw this.error; }
  }
  resolve(useLocal: boolean) {
    if (!this.conflict) return;
    this.server = this.conflict; this.conflict = null; this.conflictBase = null; this.error = null;
    if (!useLocal || this.server.status !== 'draft') this.local = this.server.artifact;
    this.state = this.server.status !== 'draft' ? 'Frozen' : useLocal ? 'Unsaved' : 'Saved';
    this.recover(this.local, this.server); this.notify();
  }
  async submit(): Promise<EvaluationDto> {
    if (this.submitting || this.submissionUnknown) throw new Error('Check the existing submission before trying again.');
    this.submitting = true; this.notify();
    try {
      const captured = structuredClone(this.local);
      const saved = await this.flush();
      if (!same(captured, saved.artifact)) throw new Error('The captured artifact was not acknowledged. Review before submitting.');
      SubmissionReadyArtifactSchema.parse(captured);
      let evaluation: EvaluationDto;
      try { evaluation = await this.api.submit(saved.id, saved.revision); }
      catch (error) {
        // A lost submit response is reconciled by the existing attempt; never create another.
        let current: AttemptDto;
        try { current = await this.api.attempt(saved.id); }
        catch { this.submissionUnknown = true; this.error = new Error('The submission response and reconciliation read were unavailable. Editing is paused until its status is checked.'); throw this.error; }
        this.server = current;
        if (current.status !== 'draft') this.state = 'Frozen';
        if (current.evaluationId) { evaluation = await this.api.evaluation(current.evaluationId); }
        else { if (current.revision !== saved.revision) this.setConflict(current, saved.artifact); throw error; }
      }
      this.server = { ...saved, status: evaluation.status === 'completed' ? 'evaluated' : evaluation.status === 'error' ? 'execution_error' : evaluation.status, evaluationId: evaluation.id, evidenceId: evaluation.evidenceId };
      this.state = 'Frozen'; return evaluation;
    } finally { this.submitting = false; this.notify(); }
  }
  async checkSubmission() {
    try { const previous = this.server; const current = await this.api.attempt(previous.id); this.submissionUnknown = false; this.error = null; if (current.status === 'draft' && (current.revision !== previous.revision || !same(current.artifact, previous.artifact))) { this.setConflict(current, previous.artifact); } else { this.server = current; this.state = current.status === 'draft' ? same(this.local, current.artifact) ? 'Saved' : 'Unsaved' : 'Frozen'; } }
    catch (e) { this.error = e instanceof Error ? e : new Error('Submission status is still unavailable.'); }
    this.notify();
  }
  dispose() { this.disposed = true; clearTimeout(this.timer); this.listeners.clear(); }
}
