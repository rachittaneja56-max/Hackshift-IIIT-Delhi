import { useEffect, useRef, useState } from 'react';
import { getArtifacts, mentor } from './fixtures';
import { exampleResponse, mentorPacket, type DemoState } from './model';
import {
  Empty,
  EvidenceMaterials,
  EvidencePicker,
  Tag,
  now,
  useWorkspaceDraft,
  type Send,
} from './components';

const topics = [
  [
    'Transaction boundaries',
    'Which writes should share a transaction, and where should key reservation happen?',
  ],
  [
    'Concurrent retries',
    'How should two concurrent requests using the same key resolve and replay the response?',
  ],
  [
    'Idempotency design',
    'How should an account-scoped key handle response replay and a changed payload?',
  ],
  [
    'Debugging failed tests',
    'How can I investigate the duplicate credit in the synthetic concurrent retry case?',
  ],
  [
    'HLD/LLD trade-offs',
    'How can I make the request retry path and transaction boundaries clearer in my HLD and LLD?',
  ],
] as const;
export function MentorPacketView({ state }: { state: DemoState }) {
  const packet = mentorPacket(state);
  const response = exampleResponse(state);
  if (!packet || !response)
    return (
      <Empty title="No review request yet.">
        <p>
          Prepare a question, choose exact context and confirm consent to
          request an illustrative review.
        </p>
      </Empty>
    );
  const failure = packet.artifacts
    .flatMap((item) => item.checks)
    .find((item) => item.id === 'T3' && item.status === 'failed');
  return (
    <section className="dj-mentor-review">
      <div className="dj-section-heading">
        <span className="dj-kicker">
          Ananya’s technical question · recorded locally
        </span>
        <h2>{packet.question}</h2>
        <small>No real mentor received this request.</small>
      </div>
      <div className="dj-mentor-columns">
        <section className="dj-card">
          <span className="dj-kicker">Shared attempt context</span>
          <h3>Selected materials · {packet.artifacts.length}</h3>
          <EvidenceMaterials artifacts={packet.artifacts} />
          <p className="dj-footnote">
            Only the candidate’s selected context is visible here.
          </p>
        </section>
        <section className="dj-card dj-response">
          <div className="dj-person">
            <span className="dj-avatar">MS</span>
            <div>
              <h3>{mentor.name}</h3>
              <small>Illustrative mentor response — fictional.</small>
            </div>
          </div>
          <p className="dj-footnote">{response.label}</p>
          <div className="dj-message">
            <h4>Start with the observation</h4>
            <p>
              {failure
                ? `The shared synthetic T3 excerpt records a duplicate credit. ${failure.observed}`
                : 'The shared packet does not include a failed concurrency observation; no test outcome is inferred.'}
            </p>
            <h4>Make the boundary explicit</h4>
            <p>
              Reserve the account-scoped key before mutating the balance. Keep
              reservation, ledger, balance and stored response on one
              checked-out PostgreSQL client in one transaction. Under
              concurrency, a losing duplicate waits for unique-conflict
              resolution, then reads the committed operation in a new statement
              and checks its payload. Rollback must remove every partial effect.
            </p>
            <h4>A concrete next test</h4>
            <p>
              Gate two independent clients on the same key. Inject failure
              before response persistence, then inspect both returned responses
              and database state.
            </p>
            <small>Suggested investigation only; no new test was run.</small>
          </div>
          <div className="dj-learning-action">
            <strong>Revisit transaction boundaries in your LLD.</strong>
            <a href="/lab">Open HLD/LLD Engineering Lab →</a>
            <small>
              Choose your saved attempt there. This demo does not modify
              diagrams.
            </small>
          </div>
          <details className="dj-disclosure">
            <summary>Response provenance</summary>
            <p>{response.text}</p>
            <small>
              Shared fixture references: {response.references.join(', ')} ·
              meta.isMock: true
            </small>
          </details>
        </section>
      </div>
    </section>
  );
}
export function MentorWorkspace({
  state,
  send,
}: {
  state: DemoState;
  send: Send;
}) {
  const packet = state.mentor;
  const surface = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const [selected, setSelected] = useWorkspaceDraft('mentor-selected', packet.selected);
  const [question, setQuestion] = useWorkspaceDraft('mentor-question', packet.question);
  const [topic, setTopic] = useWorkspaceDraft('mentor-topic', '');
  const [preview, setPreview] = useWorkspaceDraft('mentor-preview', packet.status === 'packet_prepared');
  const [mode, setMode] = useWorkspaceDraft<'prepare' | 'review'>(
    'mentor-mode',
    packet.status === 'example_review_available' ? 'review' : 'prepare',
  );
  const prepared =
    packet.status === 'packet_prepared' &&
    packet.question === question.trim() &&
    selected.length === packet.selected.length &&
    selected.every((id) => packet.selected.includes(id));
  useEffect(() => {
    if (mounted.current) surface.current?.focus();
    else mounted.current = true;
  }, [mode, preview, packet.status]);
  return (
    <div className="dj-mentor" ref={surface} tabIndex={-1}>
      <div className="dj-heading dj-workspace-heading">
        <div className="dj-person">
          <span className="dj-avatar">MS</span>
          <div>
            <h2>Mira Sen</h2>
            <p>Backend Reliability · Fictional demo mentor</p>
          </div>
        </div>
        <div
          className="dj-segments"
          role="group"
          aria-label="Mentorship perspective"
        >
          <button
            aria-pressed={mode === 'prepare'}
            onClick={() => setMode('prepare')}
          >
            Prepare a question
          </button>
          <button
            disabled={packet.status !== 'example_review_available'}
            aria-pressed={mode === 'review'}
            onClick={() => setMode('review')}
          >
            Mentor review
          </button>
        </div>
      </div>
      <div className="dj-mentor-context"><span className="dj-kicker">Continue your engineering journey</span><strong>Retry-safe account credits</strong><p>Current difficulty: concurrent duplicate requests. Choose the HLD/LLD summary, synthetic observation and explanation you want to include.</p><small>Only selected materials enter the mentor preview.</small></div>
      {mode === 'review' ? (
        <MentorPacketView state={state} />
      ) : packet.status === 'example_review_available' ? (
        <section className="dj-card dj-success">
          <span className="dj-kicker">Context ready</span>
          <h2>Your question and selected materials are together.</h2>
          <p>Demo request — not sent to a real mentor.</p>
          <div className="dj-actions">
            <button className="dj-primary" onClick={() => setMode('review')}>
              See the example review →
            </button>
            <button
              onClick={() => {
                if (
                  send(
                    { type: 'prepare_mentor', selected, question },
                    'Packet reopened. Preview and renew consent before another request.',
                  )
                )
                  setPreview(false);
              }}
            >
              Revise packet
            </button>
          </div>
        </section>
      ) : preview && prepared ? (
        <section className="dj-card">
          <div className="dj-section-heading">
            <span className="dj-kicker">Preview what the mentor sees</span>
            <h2>A question with the right context.</h2>
          </div>
          <div className="dj-review-grid">
            <div>
              <h3>Ananya Mehta → Mira Sen</h3>
              <blockquote>{packet.question}</blockquote>
              <p className="dj-muted">All unselected artifacts are excluded.</p>
              <button onClick={() => setPreview(false)}>
                Edit question & context
              </button>
            </div>
            <div>
              <h3>Included context · {packet.selected.length}</h3>
              <EvidenceMaterials
                artifacts={getArtifacts('ananya', packet.selected)}
              />
              <label className="dj-consent">
                <input
                  type="checkbox"
                  checked={packet.consent}
                  onChange={(event) =>
                    send(
                      { type: 'mentor_consent', consent: event.target.checked },
                      'Mentor sharing preference updated.',
                    )
                  }
                />
                I allow only these selected fictional materials in this local
                mentor simulation.
              </label>
              <button
                className="dj-primary"
                disabled={!packet.consent}
                onClick={() => {
                  if (
                    send(
                      { type: 'request_mentor', at: now() },
                      'Example review ready. No real mentor was contacted.',
                    )
                  )
                    setMode('review');
                }}
              >
                Request example review →
              </button>
              <small>Demo request — not sent to a real mentor.</small>
            </div>
          </div>
        </section>
      ) : (
        <section>
          <div className="dj-section-heading">
            <span className="dj-kicker">
              Help without starting from scratch
            </span>
            <h2>What would you like help with?</h2>
            <p>
              Bring the question and the exact engineering context together.
            </p>
          </div>
          <div
            className="dj-topic-chips"
            role="group"
            aria-label="Question topics"
          >
            {topics.map(([name, suggested]) => (
              <button
                aria-pressed={topic === name}
                key={name}
                onClick={() => {
                  setTopic(name);
                  setQuestion(suggested);
                }}
              >
                {name}
              </button>
            ))}
          </div>
          <label className="dj-field dj-question">
            Your technical question
            <textarea
              maxLength={1000}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
            />
          </label>
          <EvidencePicker
            prefix="mentor"
            selected={selected}
            change={setSelected}
            mentorOnly
          />
          <div className="dj-action-footer">
            <span className="dj-muted">
              {selected.length} context materials selected · separate sharing
              consent
            </span>
            <button
              className="dj-primary"
              disabled={!selected.length || !question.trim()}
              onClick={() => {
                if (
                  send(
                    { type: 'prepare_mentor', selected, question },
                    'Mentor preview ready. Confirm the sharing scope.',
                  )
                )
                  setPreview(true);
              }}
            >
              Preview what the mentor sees →
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
