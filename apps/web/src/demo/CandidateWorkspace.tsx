import { useEffect, useRef, useState } from 'react';
import { getArtifacts, getCandidate, job } from './fixtures';
import type { DemoState } from './model';
import {
  EvidenceMaterials,
  EvidencePicker,
  JobPosting,
  Tag,
  now,
  type Persona,
  type Send,
} from './components';

export function CandidateApplicationView({
  state,
  send,
  switchPersona,
  openMentor,
}: {
  state: DemoState;
  send: Send;
  switchPersona: (value: Persona) => void;
  openMentor?: () => void;
}) {
  const app = state.applications.ananya;
  const surface = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const [selected, setSelected] = useState(app.selected);
  const [stage, setStage] = useState<
    'board' | 'details' | 'evidence' | 'review'
  >(app.status === 'prepared' ? 'review' : 'board');
  useEffect(() => {
    if (mounted.current) surface.current?.focus();
    else mounted.current = true;
  }, [stage, app.status]);
  const prepared =
    app.status === 'prepared' &&
    selected.length === app.selected.length &&
    selected.every((id) => app.selected.includes(id));
  const artifacts = getArtifacts('ananya', app.selected);
  return (
    <div className="dj-candidate" ref={surface} tabIndex={-1}>
      <div className="dj-heading dj-workspace-heading">
        <div className="dj-person">
          <span className="dj-avatar">AM</span>
          <div>
            <h2>Ananya Mehta</h2>
            <p>
              Junior Backend Engineering Candidate{' '}
              <span>· Fictional demo profile</span>
            </p>
          </div>
        </div>
        {openMentor && (
          <button onClick={openMentor}>Explore mentorship ↗</button>
        )}
      </div>
      {app.status === 'submitted_demo' ? (
        <section className="dj-card dj-success">
          <span className="dj-success-icon" aria-hidden="true">
            ✓
          </span>
          <span className="dj-kicker">Shared on your terms</span>
          <h2>Application added to the fictional employer inbox.</h2>
          <p>
            {app.selected.length} selected materials. Your submitted package is
            frozen.
          </p>
          <div className="dj-actions">
            <button
              className="dj-primary"
              onClick={() => switchPersona('Employer')}
            >
              See what the employer receives →
            </button>
            {openMentor && (
              <button onClick={openMentor}>Ask a technical question</button>
            )}
          </div>
          <details className="dj-disclosure">
            <summary>Review submitted package</summary>
            <EvidenceMaterials artifacts={artifacts} />
          </details>
        </section>
      ) : (
        <>
          <nav className="dj-local-nav" aria-label="Application stages">
            {(['board', 'details', 'evidence', 'review'] as const).map(
              (value, index) => (
                <button
                  key={value}
                  aria-current={stage === value ? 'step' : undefined}
                  disabled={
                    (value === 'review' && !prepared) ||
                    (state.job === 'draft' && value !== 'board')
                  }
                  onClick={() => setStage(value)}
                >
                  <span>0{index + 1}</span>
                  {
                    [
                      'Discover',
                      'Opportunity',
                      'Choose evidence',
                      'Review & share',
                    ][index]
                  }
                </button>
              ),
            )}
          </nav>
          {state.job === 'draft' ? (
            <section className="dj-card dj-empty">
              <h2>The fictional posting is in draft.</h2>
              <p>
                You’re replaying the publishing workflow. Publish it from the
                employer workspace to make it available here.
              </p>
              <button onClick={() => switchPersona('Employer')}>
                Open employer workspace
              </button>
            </section>
          ) : stage === 'board' ? (
            <div className="dj-discovery">
              <section className="dj-card dj-opportunity">
                <div className="dj-heading">
                  <span className="dj-company-mark">
                    N<span>Northstar Engineering</span>
                  </span>
                  <Tag tone="dj-positive">Published to demo board</Tag>
                </div>
                <JobPosting compact />
                <p>
                  Build reliable services. Bring the thinking behind your
                  engineering work.
                </p>
                <div className="dj-actions">
                  <button
                    className="dj-primary"
                    onClick={() => setStage('details')}
                  >
                    View opportunity →
                  </button>
                  <button onClick={() => setStage('evidence')}>
                    See relevant engineering work
                  </button>
                </div>
              </section>
              <aside className="dj-editorial">
                <span className="dj-kicker">
                  A conversation starts with evidence
                </span>
                <h3>More than a list of skills.</h3>
                <p>
                  Choose the work that explains how you think. Design notes,
                  test observations and trade-offs belong together.
                </p>
                <span className="dj-mini-flow">
                  Discover <span>→</span> Choose <span>→</span> Share
                </span>
                <small>
                  You control the package. Nothing is shared until you confirm.
                </small>
              </aside>
            </div>
          ) : stage === 'details' ? (
            <section className="dj-card dj-job-detail">
              <JobPosting />
              <aside>
                <span className="dj-kicker">Technical conversation topics</span>
                <ul>
                  {job.requirements.map((item) => (
                    <li key={item.id}>{item.text}</li>
                  ))}
                </ul>
                <button
                  className="dj-primary"
                  onClick={() => setStage('evidence')}
                >
                  Prepare application →
                </button>
                <small>Choose your exact evidence before sharing.</small>
              </aside>
            </section>
          ) : stage === 'evidence' ? (
            <section>
              <div className="dj-heading dj-section-heading">
                <div>
                  <span className="dj-kicker">Your engineering work</span>
                  <h2>Give your application context.</h2>
                  <p>Select the materials you want Northstar to review.</p>
                </div>
                <button
                  className="dj-primary"
                  disabled={!selected.length}
                  onClick={() => {
                    if (
                      send(
                        { type: 'prepare_application', selected },
                        'Application preview ready. Review the scope and confirm consent.',
                      )
                    )
                      setStage('review');
                  }}
                >
                  Review application ({selected.length}) →
                </button>
              </div>
              <EvidencePicker
                prefix="application"
                selected={selected}
                change={(ids) => {
                  setSelected(ids);
                }}
              />
            </section>
          ) : (
            <section className="dj-card">
              <div className="dj-section-heading">
                <span className="dj-kicker">Application preview</span>
                <h2>A focused introduction.</h2>
              </div>
              <div className="dj-review-grid">
                <div>
                  <Tag>Candidate</Tag>
                  <h3>Ananya Mehta</h3>
                  <p>
                    {job.title}
                    <br />
                    Northstar Engineering
                  </p>
                  <h4>What stays private</h4>
                  <p className="dj-muted">
                    {getCandidate('ananya')
                      .artifacts.filter(
                        (item) => !app.selected.includes(item.id),
                      )
                      .map((item) => item.label)
                      .join(' · ') ||
                      'All available fictional artifacts are included.'}
                  </p>
                  <button onClick={() => setStage('evidence')}>
                    Edit evidence selection
                  </button>
                </div>
                <div>
                  <h3>Included in your package · {artifacts.length}</h3>
                  <EvidenceMaterials artifacts={artifacts} />
                  <label className="dj-consent">
                    <input
                      type="checkbox"
                      checked={app.consent}
                      onChange={(event) =>
                        send(
                          {
                            type: 'application_consent',
                            consent: event.target.checked,
                          },
                          'Sharing preference updated.',
                        )
                      }
                    />
                    I allow only these selected fictional materials to be shared
                    inside this local demonstration.
                  </label>
                  <button
                    className="dj-primary"
                    disabled={!prepared || !app.consent}
                    onClick={() =>
                      send(
                        { type: 'submit_application', at: now() },
                        'Application recorded locally. Nothing was sent externally.',
                      )
                    }
                  >
                    Submit demo application →
                  </button>
                  <small>
                    Only your fictional name and this package enter the local
                    inbox.
                  </small>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
