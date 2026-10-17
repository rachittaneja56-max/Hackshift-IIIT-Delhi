import { useApi, useResource } from '../app/context';
import { Link } from '../app/router';
import { Badge, ErrorNotice, Loading, PageTitle } from '../components/ui';
import { EditorialCompanion, LessonBlockView } from './content';

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
      <Link href="/lab"><span>Engineering lab</span><strong>Retry-safe credits</strong><small>Compare reviewed implementations against seven disclosed checks.</small></Link>
    </div>
  </section>;
}

function SavedWork() {
  const { api, userId } = useApi();
  const history = useResource(() => api.history(), `${userId}:learn-history`);
  const items = history.data?.items ?? [];
  const drafts = items.filter(item => item.status === 'draft');
  const submitted = items.filter(item => item.status !== 'draft');

  return <section className="saved-work" aria-labelledby="saved-work-heading">
    <div className="section-heading"><div><span className="eyebrow">Your saved work</span><h2 id="saved-work-heading">Pick up where you left off.</h2></div><Link href="/evidence">Open full history →</Link></div>
    {history.loading ? <Loading label="Checking your saved attempts…" /> : history.error ? <ErrorNotice error={history.error} retry={history.reload} /> : items.length ? <>
      {drafts.length > 0 && <div className="saved-work-group"><h3>In progress <span>{drafts.length}</span></h3><div className="saved-work-list">{drafts.map(item => <article key={item.id}><div><strong>Retry-safe account credits</strong><small>Draft · created {new Date(item.createdAt).toLocaleDateString()}</small></div><Link className="button primary" href={`/lab/attempts/${item.id}`}>Resume draft</Link></article>)}</div></div>}
      {submitted.length > 0 && <div className="saved-work-group"><h3>Submitted work <span>{submitted.length}</span></h3><div className="saved-work-list">{submitted.map(item => <article key={item.id}><div><strong>Retry-safe account credits</strong><small>{item.status === 'execution_error' ? 'Execution error · no test verdict' : item.status === 'queued' || item.status === 'running' ? 'Evaluation in progress' : `Completed · submitted ${item.submittedAt ? new Date(item.submittedAt).toLocaleDateString() : 'date unavailable'}`}</small></div><Link className="button" href={`/evidence/attempts/${item.id}`}>{item.status === 'queued' || item.status === 'running' ? 'View evaluation' : 'View evidence'}</Link></article>)}</div></div>}
      {history.data?.nextCursor && <p className="small muted">Showing your recent attempts. Older work is available in <Link href="/evidence">My Evidence</Link>.</p>}
    </> : <p className="muted">No saved attempts yet. Start the lab when you are ready to draw and investigate.</p>}
  </section>;
}

export function LearnHome() {
  const { api, userId } = useApi();
  const { data, error, loading, reload } = useResource(() => api.courses(), `courses:${userId}`);
  const lessons = data?.flatMap(course => course.lessons.map(lesson => ({ ...lesson, course: course.title }))) ?? [];
  return <main id="main-content" tabIndex={-1} className="page learn-home">
    <PageTitle eyebrow="Learn & practice" title="Why can one request apply a credit twice?"><p className="lead">Start with a lost HTTP response. Learn why the client retries, then trace the write through PostgreSQL.</p><div className="hero-actions"><Link className="button primary" href="/learn/retry-safe-writes/1">Read the available lesson <span aria-hidden="true">→</span></Link><Link className="button" href="/lab">Open the engineering lab</Link></div></PageTitle>
    <section className="available-section" aria-labelledby="available-heading">
      <div className="section-heading"><div><span className="eyebrow">Available now</span><h2 id="available-heading">One lesson. One connected lab.</h2></div><Badge>Seeded lesson · editorial review pending</Badge></div>
      {loading ? <Loading label="Loading available learning…" /> : error ? <ErrorNotice error={error} retry={reload} /> : lessons.length ? <div className="available-grid">
        {lessons.map(lesson => <article className="available-card lesson-card" key={`${lesson.slug}:${lesson.version}`}><span className="available-kind">Lesson · v{lesson.version}</span><h3>{lesson.title}</h3><p>Understand application retries, durable idempotency records, and the database transaction that protects a write.</p><Link href={`/learn/${lesson.slug}/${lesson.version}`}>Read lesson <span aria-hidden="true">→</span></Link></article>)}
        <article className="available-card lab-card"><span className="available-kind">Engineering lab · retry-safe-credit v1</span><h3>Test a retry-safe credit operation.</h3><p>Draw the system, compare three reviewed implementations, and inspect the actual results of seven PostgreSQL checks.</p><Link href="/lab">Start or resume the lab <span aria-hidden="true">→</span></Link></article>
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
        <div id="lesson-start"><PageTitle eyebrow={`Seeded lesson · v${lesson.data.version}`} title={lesson.data.title}><p className="muted">{lesson.data.authoredBy}</p></PageTitle></div>
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
