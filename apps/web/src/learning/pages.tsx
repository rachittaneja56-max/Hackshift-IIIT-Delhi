import { useApi, useResource } from '../app/context';
import { Link } from '../app/router';
import { ErrorNotice, Loading, PageTitle } from '../components/ui';
import { EditorialCompanion, LessonBlockView } from './content';
import { recentWorkSummary } from '../lib/presentation';

const subjects = [
  { number: '01', title: 'Computer networks', relevance: 'HTTP retries, timeouts, lost responses and API semantics.', state: 'In the available lesson', href: '/learn/retry-safe-writes/1', kind: 'available' },
  { number: '02', title: 'Database internals', relevance: 'Transactions, uniqueness, concurrent writes and rollback.', state: 'In the available lesson', href: '/learn/retry-safe-writes/1', kind: 'available' },
  { number: '03', title: 'Object-oriented programming', relevance: 'Responsibilities, interfaces and boundaries in a service.', state: 'Planned', kind: 'planned' },
  { number: '04', title: 'Low-level design', relevance: 'Turn the contract into modules, operations and persistence rules.', state: 'Practice in the lab', href: '/lab', kind: 'practice' },
  { number: '05', title: 'HLD & system design', relevance: 'Trace requests across clients, services and data stores.', state: 'Practice in the lab', href: '/lab', kind: 'practice' },
  { number: '06', title: 'Data structures & algorithms', relevance: 'Choose representations and reason about runtime and memory.', state: 'Planned', kind: 'planned' },
] as const;

function SubjectCatalog() {
  return <section className="subject-section" aria-labelledby="subjects-heading">
    <div className="section-heading"><div><span className="eyebrow">Engineering subjects</span><h2 id="subjects-heading">Learn the ideas behind reliable software.</h2></div><p className="muted">Published lessons and lab activities are marked where they exist.</p></div>
    <div className="subject-grid">{subjects.map(subject => <article className={`subject-card ${subject.kind}`} key={subject.number}>
      <div className="subject-card-top"><span className="row-number">{subject.number}</span><span className={`subject-state ${subject.kind}`}>{subject.state}</span></div>
      <h3>{subject.title}</h3><p>{subject.relevance}</p>
      {'href' in subject && <Link href={subject.href} aria-label={`${subject.kind === 'practice' ? 'Open lab practice for' : 'Read the available lesson on'} ${subject.title}`}>{subject.kind === 'practice' ? 'Open lab activity' : 'Read the lesson'} <span aria-hidden="true">→</span></Link>}
    </article>)}</div>
  </section>;
}

function LearningBridge() {
  return <section className="learning-bridge" aria-labelledby="bridge-heading">
    <div><span className="eyebrow">From concept to investigation</span><h2 id="bridge-heading">Follow one failure from the request to the database.</h2><p>A timeout leaves the client unsure whether a write committed. The lab asks how a retry can safely return the original result.</p></div>
    <div className="bridge-flow" role="group" aria-label="HTTP retries and PostgreSQL transaction boundaries lead to the retry-safe credits lab.">
      <div><span>01</span><strong>HTTP retries</strong><small>The same operation may arrive again.</small></div><span className="bridge-plus" aria-hidden="true">+</span>
      <div><span>02</span><strong>PostgreSQL transactions</strong><small>Related writes commit or roll back together.</small></div><span className="bridge-arrow" aria-hidden="true">→</span>
      <Link href="/lab"><span>Architecture &amp; Reliability Lab</span><strong>Retry-safe account credits</strong><small>Compare reviewed implementations and inspect database observations.</small></Link>
      <Link href="/practice"><span>More practice</span><strong>Explore both engineering labs</strong><small>Choose an architecture exercise or the AI Debugging Lab.</small></Link>
    </div>
  </section>;
}

function SavedWork() {
  const { api, userId } = useApi();
  const history = useResource(() => api.history(), `${userId}:learn-history`);
  const items = history.data?.items ?? [];
  const { draftCount, submittedCount, latestDraft, latestSubmitted } = recentWorkSummary(items);

  return <section className="saved-work" aria-labelledby="saved-work-heading">
    <div className="section-heading"><div><span className="eyebrow">Your saved work</span><h2 id="saved-work-heading">Pick up where you left off.</h2></div><Link href="/evidence">Open full history →</Link></div>
    {history.loading ? <Loading label="Checking your saved attempts…" /> : history.error ? <ErrorNotice error={history.error} retry={history.reload} /> : items.length ? <>
      {latestDraft ? <article className="continue-work-card"><div><span className="eyebrow">Continue a recent draft</span><h3>Retry-safe account credits</h3><p>Created {new Date(latestDraft.createdAt).toLocaleDateString()} · {draftCount} draft{draftCount === 1 ? '' : 's'} in this recent list</p></div><Link className="button primary" href={`/lab/attempts/${latestDraft.id}`}>Resume draft</Link></article> : latestSubmitted && <article className="continue-work-card"><div><span className="eyebrow">Continue from your latest result</span><h3>Retry-safe account credits</h3><p>{latestSubmitted.status === 'execution_error' ? 'Evaluation needs attention · no test verdict' : latestSubmitted.status === 'queued' || latestSubmitted.status === 'running' ? 'Evaluation is in progress' : 'Saved evaluation results'} · {submittedCount} submitted item{submittedCount === 1 ? '' : 's'} in this recent list</p></div><Link className="button" href={`/evidence/attempts/${latestSubmitted.id}`}>{latestSubmitted.status === 'queued' || latestSubmitted.status === 'running' ? 'View evaluation' : 'View results'}</Link></article>}
      <p className="small muted">{history.data?.nextCursor ? 'Showing recent work. ' : ''}<Link href="/evidence">View all work and saved results →</Link></p>
    </> : <p className="muted">No saved attempts yet. Start the lab when you are ready to draw and investigate.</p>}
  </section>;
}

export function LearnHome() {
  const { api, userId } = useApi();
  const { data, error, loading, reload } = useResource(() => api.courses(), `courses:${userId}`);
  const lessons = data?.flatMap(course => course.lessons.map(lesson => ({ ...lesson, course: course.title }))) ?? [];
  return <main id="main-content" tabIndex={-1} className="page learn-home">
    <PageTitle eyebrow="Engineering learning workspace" title="Learn how systems fail. Design a fix. See what happened."><p className="lead">Start with a lost HTTP response, follow the retry through PostgreSQL, and compare your design with real test observations.</p><div className="hero-actions"><Link className="button primary" href="/learn/retry-safe-writes/1">Continue the lesson <span aria-hidden="true">→</span></Link><Link className="button" href="/practice">Explore practice</Link></div></PageTitle>
    <section className="available-section" aria-labelledby="available-heading">
      <div className="section-heading"><div><span className="eyebrow">Available now</span><h2 id="available-heading">One lesson. Two ways to practice.</h2></div><p className="content-status">Lesson content is seeded; editorial review is pending.</p></div>
      {loading ? <Loading label="Loading available learning…" /> : error ? <ErrorNotice error={error} retry={reload} /> : lessons.length ? <div className="available-grid">
        {lessons.map(lesson => <article className="available-card lesson-card" key={`${lesson.slug}:${lesson.version}`}><span className="available-kind">Backend reliability · Lesson 01</span><h3>{lesson.title}</h3><p>Understand application retries, durable idempotency records, and the database transaction that protects a write.</p><Link href={`/learn/${lesson.slug}/${lesson.version}`}>Read lesson <span aria-hidden="true">→</span></Link></article>)}
        <article className="available-card lab-card"><span className="available-kind">Architecture &amp; Reliability Lab</span><h3>Design a retry-safe credit operation.</h3><p>Draw the system, compare reviewed implementations, and inspect the results of seven PostgreSQL checks.</p><Link href="/lab">Open architecture lab <span aria-hidden="true">→</span></Link></article>
        <article className="available-card debugging-card"><span className="available-kind">AI Debugging Lab</span><h3>Investigate and repair a rate limiter.</h3><p>Review a constrained assistant’s source changes, run visible tests, and inspect the submitted sandbox report.</p><Link href="/lab/ai-debugging">Open AI Debugging Lab <span aria-hidden="true">→</span></Link></article>
      </div> : <p>No lessons are currently available.</p>}
    </section>
    <SavedWork />
    <LearningBridge />
    <SubjectCatalog />
  </main>;
}

const blockTitles: Record<string, string> = { retry: 'Why a request gets retried', atomicity: 'What must commit together', limits: 'What this lab can establish' };
export function LessonReader({ slug, version }: { slug: string; version: number }) {
  const { api, userId } = useApi();
  const lesson = useResource(() => api.lesson(slug, version), `${userId}:lesson:${slug}:${version}`);
  return <main id="main-content" tabIndex={-1} className="lesson-layout">
    <aside className="lesson-outline"><Link href="/learn">← All learning paths</Link><span className="eyebrow">Lesson contents</span><nav aria-label="Lesson contents">
      <a href="#lesson-start">Start here</a>
      {lesson.data?.blocks.map((block, index) => <a href={`#${block.id}`} key={block.id}>{String(index + 1).padStart(2, '0')} · {blockTitles[block.id] ?? block.id}</a>)}
      <a href="#companion">Response-loss walkthrough</a><a href="#sources">References</a>
    </nav><Link className="outline-next" href="/lab">Go to the lab →</Link><p className="small muted">Lesson reading is not assessed.</p></aside>
    <article className="lesson-reader"><div className="reading-measure">
      {lesson.loading ? <Loading label="Loading the available lesson…" /> : lesson.error ? <ErrorNotice error={lesson.error} retry={lesson.reload} /> : lesson.data && <>
        <div id="lesson-start"><PageTitle eyebrow="Backend reliability · Lesson 01" title={lesson.data.title}><p className="content-status">Editorial review is pending.</p><details className="lesson-content-details"><summary>Content details</summary><p>Seeded lesson · version {lesson.data.version}</p><p>{lesson.data.authoredBy}</p></details></PageTitle></div>
        <div className="published-blocks">{lesson.data.blocks.map((block, index) => <section className="lesson-concept" key={block.id}>
          <span className="lesson-step">{String(index + 1).padStart(2, '0')}</span><div><h2>{blockTitles[block.id] ?? 'Lesson concept'}</h2><LessonBlockView block={block} /></div>
        </section>)}</div>
        <EditorialCompanion />
        <section id="sources" className="sources"><span className="eyebrow">References</span><h2>Read the original documentation.</h2>{lesson.data.sources.map(source => <p id={`source-${source.id}`} key={source.id}>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title} <span aria-hidden="true">↗</span></a> : source.title}{source.author && ` · ${source.author}`}</p>)}<details><summary>Published content provenance</summary><p>Lesson {lesson.data.slug} · version {lesson.data.version}</p><p className="hash">SHA-256 {lesson.data.contentSha256}</p><p>Local editorial additions are separate and outside this published content hash.</p></details></section>
        <section className="next-step"><span className="eyebrow">Next · apply the concept</span><h2>Draw the retry boundary. Then compare the write paths.</h2><p>The lab stores separate HLD and LLD scenes, your implementation choice, and the resulting database observations.</p><Link className="button primary" href="/lab">Open the engineering lab →</Link></section>
      </>}
    </div></article>
  </main>;
}
