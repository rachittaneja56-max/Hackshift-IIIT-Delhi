import type { FeedbackDto } from '@trajectoryos/contracts';
export const feedbackLabel = (feedback: FeedbackDto) => feedback.source === 'rules' ? 'Rule-based explanation' : feedback.source === 'llm' ? `Model interpretation · ${feedback.provider ?? 'provider unspecified'} · ${feedback.model ?? 'model unspecified'}` : 'Feedback not available';
export function observationSummary(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(observationSummary);
  if (value && typeof value === 'object') {
    const item = value as Record<string, unknown>;
    if (Array.isArray(item.operations) && Array.isArray(item.ledger)) return { balances: item.balances, operationCount: item.operations.length, ledgerCount: item.ledger.length };
    return Object.fromEntries(Object.entries(item).filter(([key]) => !['operationId', 'operation_id', 'backendPids'].includes(key)).map(([key, child]) => [key, observationSummary(child)]));
  }
  return value;
}
