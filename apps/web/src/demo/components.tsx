import { useEffect, useRef, type ReactNode } from 'react';
import { getCandidate, job, type DemoArtifact } from './fixtures';
import type { DemoAction } from './model';

export type Persona = 'Candidate' | 'Employer' | 'Mentor';
export type Send = (action: DemoAction, message: string) => boolean;
export const now = () => new Date().toISOString();
export function Tag({
  children,
  tone = '',
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`dj-tag ${tone}`}>{children}</span>;
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="dj-empty">
      <h3>{title}</h3>
      {children}
    </div>
  );
}
export function Confirmation({
  title,
  children,
  confirm,
  close,
  label,
}: {
  title: string;
  children: ReactNode;
  confirm: () => void;
  close: () => void;
  label: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const previous = useRef(
    typeof document === 'undefined' ? null : document.activeElement,
  );
  useEffect(() => {
    ref.current?.showModal();
    return () => {
      if (previous.current instanceof HTMLElement) previous.current.focus();
    };
  }, []);
  return (
    <dialog
      className="dj-dialog"
      ref={ref}
      aria-labelledby="dj-confirm-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <span className="dj-kicker">Local demo action</span>
      <h2 id="dj-confirm-title">{title}</h2>
      {children}
      <div className="dj-actions">
        <button autoFocus onClick={close}>
          Cancel
        </button>
        <button className="dj-primary" onClick={confirm}>
          {label}
        </button>
      </div>
    </dialog>
  );
}
export function artifactTitle(item: DemoArtifact) {
  if (item.id === 'a-hld') return 'HLD — Retry-safe Credit API';
  if (item.id === 'a-lld') return 'LLD — Idempotency Handling';
  if (item.id === 'a-tests') return 'Test observations';
  if (item.id === 'a-reasoning') return 'Engineering reasoning';
  return item.label;
}
const previews: Record<string, string> = {
  'a-hld': 'Client → API → PostgreSQL; the request retry path.',
  'a-lld': 'Key reservation, transaction boundary and response replay.',
  'a-tests':
    'Six of seven synthetic checks passed; one concurrency case failed.',
  'a-reasoning':
    'Investigates why concurrent requests credited the balance twice.',
  'a-failure': 'T3 failed: duplicate ledger entries and an extra credit.',
  'a-critique': 'Why a unique key alone cannot protect separate writes.',
  'a-profile': 'Self-reported interests; experience and authorship unverified.',
};
export function EvidenceMaterials({
  artifacts,
  empty = 'No materials selected.',
}: {
  artifacts: DemoArtifact[];
  empty?: string;
}) {
  if (!artifacts.length) return <p className="dj-muted">{empty}</p>;
  return (
    <div className="dj-materials">
      {artifacts.map((item) => (
        <details className="dj-material" key={item.id}>
          <summary>
            <span>
              <strong>{artifactTitle(item)}</strong>
              <small>{item.source}</small>
            </span>
            <span className="dj-expand" aria-hidden="true">
              ↗
            </span>
          </summary>
          <div className="dj-material-body">
            <h4>{item.label}</h4>
            <p>{item.content}</p>
            {(item.kind === 'hld' || item.kind === 'lld') && (
              <div
                className="dj-diagram"
                aria-label="Representative design summary"
              >
                <span>
                  {item.kind === 'hld' ? 'Client' : 'Key reservation'}
                </span>
                <span>→</span>
                <span>
                  {item.kind === 'hld' ? 'Credit API' : 'Transaction'}
                </span>
                <span>→</span>
                <span>
                  {item.kind === 'hld' ? 'PostgreSQL' : 'Stored response'}
                </span>
              </div>
            )}
            {!!item.checks.length && (
              <ul className="dj-checks">
                {item.checks.map((check) => (
                  <li key={check.id}>
                    <div className="dj-heading">
                      <strong>
                        {check.id} · {check.label}
                      </strong>
                      <Tag
                        tone={
                          check.status === 'failed'
                            ? 'dj-warning'
                            : 'dj-positive'
                        }
                      >
                        {check.status} · synthetic
                      </Tag>
                    </div>
                    <p>
                      <b>Expected:</b> {check.expected}
                    </p>
                    <p>
                      <b>Observed:</b> {check.observed}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <small>Fixture reference: {item.id} · meta.isMock: true</small>
          </div>
        </details>
      ))}
    </div>
  );
}
export function EvidencePicker({
  selected,
  change,
  prefix,
  mentorOnly = false,
}: {
  selected: string[];
  change: (ids: string[]) => void;
  prefix: string;
  mentorOnly?: boolean;
}) {
  return (
    <fieldset className="dj-picker">
      <legend>
        Choose exact materials <span>Nothing selected by default</span>
      </legend>
      <div className="dj-evidence-grid">
        {getCandidate('ananya')
          .artifacts.filter(
            (item) =>
              !mentorOnly ||
              ['hld', 'lld', 'tests', 'reasoning'].includes(item.kind),
          )
          .map((item) => (
            <article
              className={`dj-evidence-card ${selected.includes(item.id) ? 'dj-selected' : ''}`}
              key={item.id}
            >
              <label htmlFor={`${prefix}-${item.id}`}>
                <span className="dj-heading">
                  <span className="dj-kicker">
                    {item.kind === 'tests'
                      ? 'Synthetic assessment'
                      : item.kind === 'hld' || item.kind === 'lld'
                        ? 'Design summary'
                        : 'Candidate writing'}
                  </span>
                  <input
                    type="checkbox"
                    id={`${prefix}-${item.id}`}
                    checked={selected.includes(item.id)}
                    onChange={() =>
                      change(
                        selected.includes(item.id)
                          ? selected.filter((id) => id !== item.id)
                          : [...selected, item.id],
                      )
                    }
                  />
                </span>
                <strong>{artifactTitle(item)}</strong>
                <p>{previews[item.id] || item.content.split('. ')[0]}</p>
                <small>{item.source}</small>
              </label>
              <details>
                <summary>Expand preview</summary>
                <p>{item.content}</p>
              </details>
            </article>
          ))}
      </div>
    </fieldset>
  );
}
export function JobPosting({ compact = false }: { compact?: boolean }) {
  return (
    <div className="dj-posting">
      <span className="dj-kicker">Northstar Engineering</span>
      <h2>{job.title}</h2>
      <p className="dj-muted">{job.arrangement}</p>
      <div className="dj-tags">
        {['HTTP', 'PostgreSQL', 'Concurrency', 'System Design'].map((topic) => (
          <Tag key={topic}>{topic}</Tag>
        ))}
      </div>
      {!compact && (
        <>
          <h3>Overview</h3>
          <p>{job.description}</p>
          <h3>What you’ll work on</h3>
          <ul>
            {job.responsibilities.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
          <h3>Bring your engineering thinking</h3>
          <p>
            Design summaries, honest test observations and a written explanation
            can support a technical conversation. Share only the materials you
            choose.
          </p>
        </>
      )}
    </div>
  );
}
