import { useEffect, useState } from 'react';
import { Link } from '../app/router';
import { EvidenceComparison } from './EvidenceComparison';
import { ProblemSequence } from './ProblemSequence';
import { EngineeringJourney } from './EngineeringJourney';
import './landing.css';

function AppearanceButton() {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('trajectoryos:theme') ?? 'system'; }
    catch { return 'system'; }
  });
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
    };
    apply();
    media.addEventListener('change', apply);
    try { localStorage.setItem('trajectoryos:theme', theme); } catch {}
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  return <button type="button" className="lp-theme" aria-label={'Appearance: ' + theme + '. Change appearance'} onClick={() => setTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system')}>{theme === 'dark' ? '☾' : theme === 'light' ? '☀' : '◐'}</button>;
}

export function LandingPage() {
  return <div className="landing-page">
    <header className="lp-header">
      <Link className="lp-brand" href="/" aria-label="TrajectoryOs home"><span className="lp-brand-mark" aria-hidden="true">t↗</span>Trajectory<span>Os</span></Link>
      <nav aria-label="Landing navigation"><a href="#the-problem">The challenge</a><a href="#how-it-works">How it works</a><a href="#career-example">For careers</a></nav>
      <div className="lp-header-actions"><AppearanceButton /><Link className="lp-header-link" href="/learn">Enter workspace <span aria-hidden="true">↗</span></Link></div>
    </header>
    <main id="main-content" tabIndex={-1}>
      <section className="lp-hero" aria-labelledby="lp-hero-title">
        <div className="lp-hero-grid">
          <div className="lp-hero-copy">
            <span className="lp-kicker">HACKSHIFT 2026 <span aria-hidden="true">/</span> ENTREPRENEURSHIP &amp; EMPLOYMENT</span>
            <h1 id="lp-hero-title">A résumé lists skills.<span>What happens when the system fails?</span></h1>
            <p className="lp-hero-description">Courses can teach the concepts. A résumé can list them. Neither shows the choices an engineer makes when something goes wrong.</p>
            <p className="lp-hero-description lp-hero-explanation">TrajectoryOs brings the lesson, design, code investigation and actual test results into one reviewable record.</p>
            <div className="lp-actions">
              <Link className="lp-action-primary" href="/lab">Explore the lab <span aria-hidden="true">↗</span></Link>
              <a className="lp-action-secondary" href="#how-it-works">See how it works <span aria-hidden="true">↓</span></a>
            </div>
            <span className="lp-hero-small">Engineering practice first. Career context follows.</span>
          </div>
          <EvidenceComparison />
        </div>
        <div className="lp-hero-bottom"><span>ONE PROBLEM. DESIGN DECISIONS. OBSERVED RESULTS.</span><a href="#the-problem">Explore the failure <span aria-hidden="true">↓</span></a></div>
      </section>

      <ProblemSequence />
      <EngineeringJourney />

      <section className="lp-section lp-career" id="career-example" aria-labelledby="lp-career-title">
        <div className="lp-career-layout">
          <div className="lp-career-copy">
            <span className="lp-kicker">03 / EMPLOYMENT</span>
            <h2 id="lp-career-title">The résumé starts a conversation. <span>The work gives it substance.</span></h2>
            <p>Instead of another self-reported skill score, a candidate can bring specific engineering decisions and test observations into a role discussion.</p>
            <p>Our private career tool compares a job description with completed evidence the candidate selects. The employer journey shown here is an interactive fictional demo, not a live recruitment service.</p>
            <Link className="lp-inline-link" href="/demo/journey">Walk through the candidate and employer demo <span aria-hidden="true">↗</span></Link>
          </div>
          <div className="lp-job" aria-label="Fictional example of a candidate evidence review">
            <div className="lp-job-head"><div><span>FICTIONAL JOB EXAMPLE</span><h3>Junior Backend Engineer</h3><p>Northstar Engineering · Example role</p></div><span className="lp-job-symbol" aria-hidden="true">N</span></div>
            <div className="lp-job-rows">
              <div className="lp-job-row"><div><span>01 / DATABASES</span><strong>PostgreSQL and transactions</strong></div><p>Review the saved write-boundary decision and recorded checks.</p><span className="lp-result lp-result-neutral">Evidence to inspect</span></div>
              <div className="lp-job-row"><div><span>02 / RELIABILITY</span><strong>Concurrent requests</strong></div><p>A failed retry observation remains part of the record, not hidden.</p><span className="lp-result lp-result-attention">Failure recorded</span></div>
              <div className="lp-job-row"><div><span>03 / SYSTEM DESIGN</span><strong>HLD / LLD</strong></div><p>Designs are available for discussion, not automatically certified.</p><span className="lp-result lp-result-neutral">Human review</span></div>
            </div>
            <div className="lp-job-foot"><span>Candidate controls what is shared</span><span>Manual employer decision ↗</span></div>
          </div>
        </div>
      </section>

      <section className="lp-finale" aria-labelledby="lp-finale-title">
        <div><span className="lp-kicker">TRY THE ENGINEERING WORKSPACE</span><h2 id="lp-finale-title">Start with the failure. <span>Keep the reasoning.</span></h2><p>Investigate a lost response, decide what should happen on retry, and see what the database tests actually found.</p></div>
        <Link className="lp-action-primary" href="/lab">Open the Engineering Lab <span aria-hidden="true">↗</span></Link>
      </section>
    </main>
    <footer className="lp-footer"><Link className="lp-brand" href="/">Trajectory<span>Os</span></Link><span>Built at HackShift 2026 · IIIT Delhi</span><span>Evidence with its limitations intact.</span></footer>
  </div>;
}
