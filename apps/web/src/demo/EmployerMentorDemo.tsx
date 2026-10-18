import { useEffect, useRef, useState } from 'react';
import { useRouter } from '../app/router';
import type { CandidateId } from './fixtures';
import {
  isShortlisted,
  loadDemoState,
  saveDemoState,
  transition,
  type DemoState,
} from './model';
import { CandidateApplicationView } from './CandidateWorkspace';
import { EmployerWorkspace } from './EmployerWorkspace';
import { MentorWorkspace } from './MentorWorkspace';
import { Confirmation, WorkspaceDraftContext, type Persona, type Send } from './components';
import './demo.css';

// Preserve these exports for the existing workflow verification entry point.
export { CandidateApplicationView } from './CandidateWorkspace';
export { EmployerProfile, RequirementEvidence } from './EmployerWorkspace';
export { MentorPacketView } from './MentorWorkspace';
export { EvidenceMaterials, JobPosting } from './components';
function browserStorage() {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** Synthetic-only experience. No real evidence service, authentication or API dependency. */
export function EmployerMentorDemo() {
  const { search } = useRouter();
  const drafts = useRef(new Map<string, unknown>());
  const [loaded] = useState(() => loadDemoState(browserStorage()));
  const [state, setState] = useState<DemoState>(loaded.state);
  const [persona, setPersona] = useState<Persona>(() => new URLSearchParams(search).get('view') === 'mentor' ? 'Mentor' : 'Candidate');
  const [selected, setSelected] = useState<CandidateId>(
    loaded.state.applications.ananya.status === 'submitted_demo'
      ? 'ananya'
      : 'kabir',
  );
  const [message, setMessage] = useState(loaded.notice);
  const [storageFailed, setStorageFailed] = useState(false);
  const [confirmation, setConfirmation] = useState<'reset' | 'replay' | null>(
    null,
  );
  const [epoch, setEpoch] = useState(0);
  const [guided, setGuided] = useState(false);
  const [reviewVisited, setReviewVisited] = useState(false);
  useEffect(() => {
    setStorageFailed(!saveDemoState(browserStorage(), state));
  }, [state]);
  const send: Send = (action, text) => {
    try {
      const next = transition(state, action);
      setState(next);
      setMessage(text);
      return true;
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'The demo action could not be completed.',
      );
      return false;
    }
  };
  function switchPersona(value: Persona) {
    if (
      value === 'Employer' &&
      state.applications.ananya.status === 'submitted_demo'
    ) {
      setSelected('ananya');
      setReviewVisited(true);
    }
    setPersona(value);
  }
  const submitted = state.applications.ananya.status === 'submitted_demo';
  const shortlisted = isShortlisted(state, 'ananya');
  const mentorRequested = state.mentor.status === 'example_review_available';
  const guide = !submitted
    ? {
        step: state.applications.ananya.status === 'prepared' ? 2 : 1,
        title: 'Discover the opportunity, then share engineering work.',
        text: 'Open the role, choose evidence and review your package. Consent and submission are always yours.',
        target: 'Candidate' as const,
        action: 'Explore as candidate →',
      }
    : !reviewVisited
      ? {
          step: 3,
          title: 'Review the application as the employer.',
          text: 'Open Ananya’s shared package and compare the requirements with the evidence.',
          target: 'Employer' as const,
          action: 'Review Ananya →',
        }
      : !shortlisted
        ? {
            step: 4,
            title: 'Make a manual reviewer decision.',
            text: 'Inspect the observations, then confirm a shortlist if you choose. You can also explore mentorship at any time.',
            target: 'Employer' as const,
            action: 'Open reviewer workspace →',
          }
        : {
            step: 5,
            title: 'Explore contextual mentorship.',
            text: 'Choose a question and a separate context packet. Mentorship is available independently of shortlisting.',
            target: 'Mentor' as const,
            action: 'Explore mentorship →',
          };
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="demo-journey"
      data-demo-provenance="fictional"
      data-is-mock="true"
    >
      <header className="dj-heading dj-top">
        <div>
          <span className="dj-kicker">
            TrajectoryOs / Engineering work, in context
          </span>
          <h1>
            Career Journey <span>· Interactive Demo</span>
          </h1>
          <p>
            Fictional company, candidates and mentor. All activity stays in this
            browser.
          </p>
        </div>
        <div className="dj-actions">
          <button aria-pressed={guided} onClick={() => setGuided(!guided)}>
            {guided ? 'Exit guided journey' : 'Follow the journey'}
          </button>
          <button
            className="dj-text-button"
            onClick={() => setConfirmation('reset')}
          >
            Reset demo
          </button>
        </div>
      </header>
      <nav className="dj-personas" aria-label="Demo persona switcher">
        {(['Candidate', 'Employer', 'Mentor'] as const).map((value, index) => (
          <button
            key={value}
            aria-pressed={persona === value}
            aria-controls={`dj-${value.toLowerCase()}-workspace`}
            onClick={() => switchPersona(value)}
          >
            <span className="dj-persona-number">0{index + 1}</span>
            <span>
              <strong>{value}</strong>
              <small>
                {value === 'Candidate'
                  ? 'Discover & share'
                  : value === 'Employer'
                    ? 'Review & decide'
                    : 'Question & context'}
              </small>
            </span>
            <span className="dj-persona-arrow" aria-hidden="true">
              ↗
            </span>
          </button>
        ))}
      </nav>
      <ul className="dj-status-strip" aria-label="Local demo status">
        <li data-active={state.job === 'published_demo'}>
          <span />
          Job {state.job === 'published_demo' ? 'published' : 'not published'}
        </li>
        <li data-active={submitted}>
          <span />
          Application {submitted ? 'submitted' : 'not submitted'}
        </li>
        <li data-active={shortlisted}>
          <span />
          Manual shortlist {shortlisted ? 'recorded' : 'not recorded'}
        </li>
        <li data-active={mentorRequested}>
          <span />
          Mentor packet {mentorRequested ? 'requested' : 'not requested'}
        </li>
      </ul>
      {guided && (
        <aside className="dj-guide" aria-label="Guided journey">
          <span className="dj-guide-number">0{guide.step}</span>
          <div>
            <strong>{guide.title}</strong>
            <p>{guide.text}</p>
          </div>
          <button onClick={() => switchPersona(guide.target)}>
            {guide.action}
          </button>
        </aside>
      )}
      <div className="dj-status" role="status">
        {message}
      </div>
      {storageFailed && (
        <p className="dj-error" role="alert">
          Browser storage is unavailable or full. Refreshing may lose demo
          changes.
        </p>
      )}
      <WorkspaceDraftContext.Provider key={epoch} value={drafts.current}>
        {persona === 'Candidate' &&
        <section
          id="dj-candidate-workspace"
          aria-label="Candidate workspace"
          hidden={persona !== 'Candidate'}
        >
          <CandidateApplicationView
            state={state}
            send={send}
            switchPersona={switchPersona}
            openMentor={() => switchPersona('Mentor')}
          />
        </section>
        }
        {persona === 'Employer' &&
        <section
          id="dj-employer-workspace"
          aria-label="Employer workspace"
          hidden={persona !== 'Employer'}
        >
          <EmployerWorkspace
            active={persona === 'Employer'}
            state={state}
            send={send}
            selected={selected}
            select={setSelected}
            replay={() => setConfirmation('replay')}
          />
        </section>
        }
        {persona === 'Mentor' &&
        <section
          id="dj-mentor-workspace"
          aria-label="Mentor workspace"
          hidden={persona !== 'Mentor'}
        >
          <MentorWorkspace state={state} send={send} />
        </section>
        }
      </WorkspaceDraftContext.Provider>
      <footer className="dj-footer">
        <span>Synthetic demo only · no external applications or messages.</span>
        <details>
          <summary>About this browser demo</summary>
          <p>
            State is shared across signed-in accounts on this device. Reset
            before handing over a shared browser. Use fictional questions and
            notes only; never enter real résumés, private records or secrets.
          </p>
          <small>Fixture provenance · meta.isMock: true</small>
        </details>
      </footer>
      {confirmation && (
        <Confirmation
          title={
            confirmation === 'replay'
              ? 'Replay publishing from a fresh draft?'
              : 'Restore the initial fictional scenario?'
          }
          label={
            confirmation === 'replay'
              ? 'Reset & replay publishing'
              : 'Reset local demo'
          }
          close={() => setConfirmation(null)}
          confirm={() => {
            if (
              send(
                {
                  type:
                    confirmation === 'replay' ? 'replay_publication' : 'reset',
                },
                confirmation === 'replay'
                  ? 'Fresh draft restored. Publish it from the employer workspace.'
                  : 'Demo reset. Published job and seeded applicants restored; Ananya’s consent and all review actions cleared.',
              )
            ) {
              drafts.current.clear();
              setEpoch((value) => value + 1);
              setPersona(confirmation === 'replay' ? 'Employer' : 'Candidate');
              setSelected('kabir');
              setReviewVisited(false);
              setConfirmation(null);
            }
          }}
        >
          <p>
            This clears Ananya’s application, both sharing consents, mentor
            packet and local reviewer history. Kabir and Meera’s pre-seeded
            packages return.{' '}
            {confirmation === 'replay'
              ? 'The fictional posting will start in draft.'
              : 'The fictional posting will be published and ready to explore.'}
          </p>
        </Confirmation>
      )}
    </main>
  );
}
