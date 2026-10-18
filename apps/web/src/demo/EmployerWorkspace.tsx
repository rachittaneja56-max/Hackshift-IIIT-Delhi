import { useEffect, useState, type ReactNode } from 'react';
import {
  candidateIds,
  getCandidate,
  job,
  type CandidateId,
  type DemoArtifact,
} from './fixtures';
import {
  employerApplication,
  isShortlisted,
  requirementMapping,
  type DemoState,
} from './model';
import {
  Confirmation,
  Empty,
  EvidenceMaterials,
  JobPosting,
  Tag,
  now,
  type Send,
} from './components';

export function RequirementEvidence({
  artifacts,
}: {
  artifacts: DemoArtifact[];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const rows = requirementMapping(artifacts);
  return (
    <section
      className="dj-requirements"
      aria-label="Requirement-to-evidence mapping"
    >
      <div className="dj-heading">
        <h3>Requirements ↔ supporting evidence</h3>
        <small>Human interpretation required</small>
      </div>
      <div className="dj-comparison">
        <div className="dj-comparison-head">
          <span>Role requirement</span>
          <span>Shared evidence & observation</span>
        </div>
        {rows.map((row) => (
          <div className="dj-requirement-row" key={row.id}>
            <div>
              <strong>{row.requirement}</strong>
              <small>
                {row.support.length
                  ? 'Evidence available for review'
                  : 'Not assessed from shared materials'}
              </small>
            </div>
            <div>
              {row.support.length ? (
                <>
                  <div className="dj-observations">
                    {row.support
                      .filter(
                        (item, index, all) =>
                          item.outcome !== 'review' &&
                          all.findIndex((other) => other.text === item.text) ===
                            index,
                      )
                      .map((item) => (
                        <Tag
                          key={item.id}
                          tone={
                            item.outcome === 'failed'
                              ? 'dj-warning'
                              : 'dj-positive'
                          }
                        >
                          {item.text.split(' · ')[0]} · {item.outcome}
                        </Tag>
                      ))}
                    {row.support.some((item) => item.outcome === 'review') && (
                      <Tag>Written context</Tag>
                    )}
                  </div>
                  <button
                    className="dj-text-button"
                    aria-expanded={expanded === row.id}
                    onClick={() =>
                      setExpanded(expanded === row.id ? null : row.id)
                    }
                  >
                    {expanded === row.id
                      ? 'Close supporting evidence'
                      : 'Open supporting evidence'}{' '}
                    ↗
                  </button>
                  {expanded === row.id && (
                    <div className="dj-support">
                      {row.support.map((item) => (
                        <p key={item.id}>
                          <strong
                            className={
                              item.outcome === 'failed' ? 'dj-failed-text' : ''
                            }
                          >
                            {item.text}
                          </strong>
                          <small>{item.limitation}</small>
                        </p>
                      ))}
                      <EvidenceMaterials
                        artifacts={artifacts.filter((item) =>
                          row.support.some(
                            (support) => support.artifactId === item.id,
                          ),
                        )}
                      />
                    </div>
                  )}
                </>
              ) : (
                <span className="dj-muted">No shared observation</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="dj-footnote">
        Synthetic test results describe a reviewed implementation. They do not
        prove learner authorship or production competence. Design and writing
        correctness require human review.
      </p>
    </section>
  );
}
export function EmployerProfile({
  state,
  id,
  decision,
}: {
  state: DemoState;
  id: CandidateId;
  decision?: ReactNode;
}) {
  const packet = employerApplication(state, id);
  if (!packet)
    return (
      <Empty title="No application shared yet.">
        <p>
          {getCandidate(id).name} has not submitted a package. Private artifacts
          are not available to the employer.
        </p>
      </Empty>
    );
  const failed = packet.artifacts
    .flatMap((item) => item.checks)
    .some((check) => check.status === 'failed');
  return (
    <div className="dj-profile">
      <div className="dj-heading dj-profile-header">
        <div>
          <span className="dj-kicker">Fictional profile · evidence review</span>
          <h2>{packet.name}</h2>
          <p>{job.title}</p>
        </div>
        <Tag tone={isShortlisted(state, id) ? 'dj-positive' : ''}>
          {isShortlisted(state, id) ? 'Manually shortlisted' : 'Submitted'}
        </Tag>
      </div>
      {decision}
      <section className="dj-shared-summary">
        <div className="dj-heading">
          <h3>What they shared</h3>
          <small>
            {packet.artifacts.length} materials ·{' '}
            {packet.application.origin === 'seeded_demo_application'
              ? 'Pre-seeded application'
              : 'Explicit demo consent recorded'}
          </small>
        </div>
        <div className="dj-tags">
          {packet.artifacts.map((item) => (
            <Tag key={item.id}>
              {item.kind === 'tests'
                ? 'Synthetic observations'
                : item.kind.toUpperCase()}
            </Tag>
          ))}
        </div>
        {failed && (
          <p className="dj-failure-notice">
            <strong>T3 failed · synthetic observation</strong> Concurrent
            retries produced a duplicate credit. Open the supporting evidence to
            inspect the failure.
          </p>
        )}
      </section>
      <RequirementEvidence artifacts={packet.artifacts} />
      <details className="dj-disclosure">
        <summary>Open detailed artifacts · {packet.artifacts.length}</summary>
        <EvidenceMaterials artifacts={packet.artifacts} />
      </details>
    </div>
  );
}
export function EmployerWorkspace({
  state,
  send,
  selected,
  select,
  replay,
  active = true,
}: {
  active?: boolean;
  state: DemoState;
  send: Send;
  selected: CandidateId;
  select: (id: CandidateId) => void;
  replay: () => void;
}) {
  const [filter, setFilter] = useState<'All' | 'Submitted' | 'Shortlisted'>(
    'All',
  );
  useEffect(() => {
    if (active) setFilter('All');
  }, [active]);
  const [confirm, setConfirm] = useState<CandidateId | null>(null);
  const [note, setNote] = useState('');
  const [posting, setPosting] = useState(false);
  const visible = candidateIds.filter(
    (id) =>
      filter === 'All' ||
      (filter === 'Submitted' && !!employerApplication(state, id)) ||
      (filter === 'Shortlisted' && isShortlisted(state, id)),
  );
  const history = state.decisions.filter(
    (item) => item.candidateId === selected,
  );
  const packet = employerApplication(state, selected);
  const decision = (
    <section className="dj-decision" aria-label="Human reviewer decision">
      <div>
        <strong>
          {isShortlisted(state, selected)
            ? 'Shortlisted for a technical conversation'
            : 'Your review, your decision'}
        </strong>
        <small>
          {isShortlisted(state, selected)
            ? `Manual decision · ${new Date(history.at(-1)!.timestamp).toLocaleString()}`
            : 'Review the evidence and decide what to explore together.'}
        </small>
      </div>
      {isShortlisted(state, selected) ? (
        <button
          onClick={() =>
            send(
              { type: 'reverse_shortlist', candidateId: selected, at: now() },
              'Shortlist reversed. Both actions remain in local history.',
            )
          }
        >
          Reverse shortlist
        </button>
      ) : (
        <button
          className="dj-primary"
          disabled={state.decisions.length >= 199}
          onClick={() => {
            setNote('');
            setConfirm(selected);
          }}
        >
          Shortlist for technical conversation
        </button>
      )}
    </section>
  );
  return (
    <>
      <div className="dj-heading dj-workspace-heading">
        <div className="dj-person">
          <span className="dj-company-avatar">N</span>
          <div>
            <h2>Northstar Engineering</h2>
            <p>
              {job.title} ·{' '}
              {state.job === 'draft' ? 'Draft posting' : 'Published locally'}
            </p>
          </div>
        </div>
        <div className="dj-actions">
          <button aria-expanded={posting} onClick={() => setPosting(!posting)}>
            {posting ? 'Hide posting' : 'View posting'}
          </button>
          {state.job === 'draft' ? (
            <button
              className="dj-primary"
              onClick={() =>
                send(
                  { type: 'publish' },
                  'Fictional job published to the local board.',
                )
              }
            >
              Publish to demo board
            </button>
          ) : (
            <button onClick={replay}>Replay publishing</button>
          )}
        </div>
      </div>
      {posting && (
        <section className="dj-card dj-posting-panel">
          <JobPosting />
        </section>
      )}
      <div className="dj-employer-grid">
        <aside className="dj-card dj-inbox" aria-label="Applicant inbox">
          <div className="dj-heading">
            <h3>Applicant inbox</h3>
            <Tag>
              {
                candidateIds.filter((id) => employerApplication(state, id))
                  .length
              }{' '}
              submitted
            </Tag>
          </div>
          <div
            className="dj-segments"
            role="group"
            aria-label="Applicant filter"
          >
            {(['All', 'Submitted', 'Shortlisted'] as const).map((value) => (
              <button
                key={value}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {value}
              </button>
            ))}
          </div>
          {!visible.length && (
            <Empty title="No manual shortlists yet.">
              <p>Choose an applicant and review their shared evidence.</p>
            </Empty>
          )}
          <div className="dj-applicant-list">
            {visible.map((id) => {
              const application = employerApplication(state, id);
              return (
                <button
                  className={`dj-applicant ${selected === id ? 'dj-selected' : ''}`}
                  key={id}
                  aria-pressed={selected === id}
                  onClick={() => select(id)}
                >
                  <span className="dj-avatar">
                    {getCandidate(id)
                      .name.split(' ')
                      .map((part) => part[0])
                      .join('')}
                  </span>
                  <span>
                    <strong>{getCandidate(id).name}</strong>
                    <small>Backend role interest</small>
                    <span className="dj-applicant-evidence">
                      {application
                        ? `${application.artifacts.length} shared materials · ${application.artifacts.map((item) => (item.kind === 'tests' ? 'tests' : item.kind)).join(', ')}`
                        : 'No evidence shared'}
                    </span>
                    <span
                      className={`dj-inbox-state ${isShortlisted(state, id) ? 'dj-positive' : ''}`}
                    >
                      {isShortlisted(state, id)
                        ? '● Shortlisted manually'
                        : application
                          ? 'Submitted'
                          : 'Not submitted'}
                      {id !== 'ananya' ? ' · Pre-seeded' : ''}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="dj-footnote">
            Listed in fixture order. Kabir and Meera have pre-seeded
            applications.
          </p>
        </aside>
        <section className="dj-card dj-review-pane">
          <EmployerProfile
            state={state}
            id={selected}
            decision={packet ? decision : undefined}
          />
          {packet && (
            <details className="dj-disclosure">
              <summary>
                Human reviewer history · {history.length} actions
              </summary>
              {!history.length ? (
                <p>No manual action recorded.</p>
              ) : (
                <ol className="dj-history">
                  {history.map((item, index) => (
                    <li key={index}>
                      <strong>
                        {item.decision === 'shortlisted_demo'
                          ? 'Shortlisted manually'
                          : 'Shortlist reversed'}
                      </strong>
                      <p>{item.reviewerNote || 'No reviewer note added.'}</p>
                      <small>
                        <time dateTime={item.timestamp}>
                          {new Date(item.timestamp).toLocaleString()}
                        </time>{' '}
                        · human-demo-action
                      </small>
                    </li>
                  ))}
                </ol>
              )}
            </details>
          )}
        </section>
      </div>
      {confirm && (
        <Confirmation
          title={`Shortlist ${getCandidate(confirm).name}?`}
          label="Confirm human demo shortlist"
          close={() => setConfirm(null)}
          confirm={() => {
            if (
              send(
                {
                  type: 'shortlist',
                  candidateId: confirm,
                  confirmed: true,
                  note,
                  at: now(),
                },
                'Manual shortlist recorded. No invitation was sent.',
              )
            )
              setConfirm(null);
          }}
        >
          <p>
            This records a local reviewer decision for a technical conversation.
            No email, invitation or recruitment action is sent.
          </p>
          <label className="dj-field">
            Reviewer note (optional)
            <textarea
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What would you explore together?"
            />
          </label>
        </Confirmation>
      )}
    </>
  );
}
