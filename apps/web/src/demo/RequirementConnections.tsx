import { getArtifacts, job } from './fixtures';
import { EvidenceMaterials } from './components';

const connections: Record<string, { learning?: string; context: string; ids: string[] }> = {
  retries: { learning: 'Computer Networks · request/response loss and application retries', context: 'Observed test behavior: sequential response replay and changed-payload conflict. Related learning does not establish proficiency.', ids: ['a-tests'] },
  rollback: { learning: 'Database Internals · atomicity and rollback', context: 'Observed test behavior: rollback then retry passed in the synthetic record. Other schedules remain unassessed.', ids: ['a-tests'] },
  concurrency: { context: 'Synthetic concurrency check failed: duplicate credit. Candidate writing investigates reservation and transaction boundaries.', ids: ['a-failure', 'a-reasoning'] },
  design: { context: 'Submitted design material: representative HLD and LLD summaries. Design correctness requires review.', ids: ['a-hld', 'a-lld'] },
  communication: { context: 'Candidate writing: an explanation of the observed duplicate effect and remaining uncertainty.', ids: ['a-reasoning'] },
};
export function CandidateRequirementConnections() {
  return <section className="dj-job-connections" aria-label="How this role connects to your history"><span className="dj-kicker">Explore before you share</span><h3>Why this role connects to your history</h3>{job.requirements.map(requirement => {
    const connection = connections[requirement.id]!;
    return <details key={requirement.id}><summary>{requirement.text}</summary>{connection.learning && <p className="dj-related-learning">Related learning: {connection.learning}</p>}<p>{connection.context}</p><EvidenceMaterials artifacts={getArtifacts('ananya', connection.ids)} /></details>;
  })}<p className="dj-footnote">Production experience and independent code authorship: unknown. These are relationships to your work, not a match score. Nothing here is shared automatically.</p></section>;
}
