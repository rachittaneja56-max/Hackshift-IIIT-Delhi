import { useEffect, useState } from 'react';
import { Link } from '../app/router';
import { EvidenceComparison } from './EvidenceComparison';
import { ProblemSequence } from './ProblemSequence';
import { EngineeringJourney } from './EngineeringJourney';
import './landing.css';

function AppearanceButton() {
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('trajectoryos:theme') ?? 'system'; } catch { return 'system'; } });
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { document.documentElement.dataset.theme = theme === 'system' ? media.matches ? 'dark' : 'light' : theme; };
    apply(); media.addEventListener('change', apply);
    try { localStorage.setItem('trajectoryos:theme', theme); } catch {}
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  return <button type="button" className="lp-theme" aria-label={`Appearance: ${theme}. Change appearance`} onClick={() => setTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system')}>{theme === 'dark' ? '☾' : theme === 'light' ? '☀' : '◐'}</button>;
}

export function LandingPage() {
  return <div className="landing-page">
    <header className="lp-header"><Link className="lp-brand" href="/" aria-label="TrajectoryOs home"><span className="lp-brand-mark" aria-hidden="true">↗</span>TRAJECTORY<span>OS</span></Link><nav aria-label="Landing navigation"><a href="#the-problem">The problem</a><a href="#how-it-works">How it works</a><a href="#career-example">Career connection</a></nav><div className="lp-header-actions"><AppearanceButton /><Link className="lp-header-link" href="/learn">Open lab <span aria-hidden="true">↗</span></Link></div></header>
    <main id="main-content" tabIndex={-1}>
      <section className="lp-hero" aria-labelledby="lp-hero-title"><div className="lp-hero-copy"><span className="lp-kicker"><span className="lp-kicker-line" aria-hidden="true" />HACKSHIFT 2026 · ENTREPRENEURSHIP &amp; EMPLOYMENT</span><h1 id="lp-hero-title">A resume lists skills.<br /><em>Show the engineering work behind them.</em></h1><p>Learn core CS concepts. Design systems. Investigate faulty implementations. Understand actual test results. Build a record of engineering decisions worth discussing.</p><div className="lp-actions"><Link className="lp-action-primary" href="/lab">Explore the Engineering Lab <span aria-hidden="true">↗</span></Link><Link className="lp-action-secondary" href="/demo/journey">See the career journey <span aria-hidden="true">→</span></Link></div><p className="lp-cta-note">The lab requires sign-in. Career journey opens a fictional interactive simulation after sign-in.</p></div><EvidenceComparison /><div className="lp-hero-bottom"><span>CONCEPT → DECISION → OBSERVATION → CONVERSATION</span><a href="#the-problem">SCROLL TO EXPLORE <span aria-hidden="true">↓</span></a></div></section>
      <ProblemSequence />
      <EngineeringJourney />
      <section className="lp-section lp-career" id="career-example" aria-labelledby="lp-career-title"><div className="lp-section-intro"><span className="lp-kicker">03 / THE EMPLOYMENT CONNECTION</span><h2 id="lp-career-title">A job requirement meets<br /><em>the work a learner chooses to share.</em></h2><p>A real private job-description analysis can connect requirements to selected evidence. This employer view is a fictional illustration of how a person could review it.</p></div><div className="lp-job"><div className="lp-job-head"><div><span>FICTIONAL JOB EXAMPLE</span><h3>Junior Backend Engineer</h3><p>Northstar Engineering</p></div><span className="lp-job-symbol" aria-hidden="true">N<span>↗</span></span></div><div className="lp-job-table" role="table" aria-label="Illustrative requirement to evidence relationships"><div role="row" className="lp-job-table-head"><span role="columnheader">REQUIREMENT</span><span role="columnheader">EXAMPLE SHARED MATERIAL</span><span role="columnheader">OBSERVATION</span></div><div role="row"><strong role="cell">HTTP</strong><span role="cell">Lost-response sequence and retry explanation</span><span role="cell">Design rationale available</span></div><div role="row"><strong role="cell">PostgreSQL</strong><span role="cell">Selected variant and recorded check</span><span role="cell" className="lp-observation-fail">Failed concurrent retry observation</span></div><div role="row"><strong role="cell">Concurrency</strong><span role="cell">Transaction decision and test context</span><span role="cell">Discuss the failure; no proficiency verdict</span></div><div role="row"><strong role="cell">System Design</strong><span role="cell">Saved HLD / LLD</span><span role="cell">Diagram quality unassessed</span></div></div><div className="lp-job-foot"><p>The learner chooses what to share. In this fictional demo, the employer reviews it and makes any shortlist decision manually.</p><Link href="/demo/journey">Explore the fictional career journey <span aria-hidden="true">↗</span></Link></div></div></section>
      <section className="lp-finale" aria-labelledby="lp-finale-title"><span className="lp-kicker">START WITH ONE ENGINEERING QUESTION</span><h2 id="lp-finale-title">Make the work<br /><em>visible.</em></h2><p>Follow a lost response from the lesson to the lab, then inspect what the selected implementation actually did.</p><Link className="lp-action-primary" href="/lab">Explore the Engineering Lab <span aria-hidden="true">↗</span></Link></section>
    </main><footer className="lp-footer"><Link className="lp-brand" href="/">TRAJECTORY<span>OS</span></Link><span>HACKSHIFT 2026 · IIIT DELHI</span><span>Engineering evidence, with its limits visible.</span></footer>
  </div>;
}
