import type { FeedbackDto } from '@trajectoryos/contracts';
export const feedbackLabel = (feedback: FeedbackDto) => feedback.source === 'rules' ? 'Rule-based explanation' : feedback.source === 'llm' ? `Model interpretation · ${feedback.provider ?? 'provider unspecified'} · ${feedback.model ?? 'model unspecified'}` : 'Feedback not available';
export const TEST_LABELS = {
  T1: 'One credit stores an operation, ledger entry and replayable response.',
  T2: 'Sequential retries replay the first result without another credit.',
  T3: 'Concurrent duplicate requests produce one database effect.',
  T4: 'A changed amount with the same account and key is rejected.',
  T5: 'A failure after the balance update rolls back the transaction.',
  T6: 'The same key remains independent across two accounts.',
  T7: 'Concurrent distinct keys preserve both account credits.',
} as const;
export type TestId = keyof typeof TEST_LABELS;
export function testLabel(id: string) { return TEST_LABELS[id as TestId] ?? 'Returned test observation'; }
export function observationSummary(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(observationSummary);
  if (value && typeof value === 'object') {
    const item = value as Record<string, unknown>;
    if (Array.isArray(item.operations) && Array.isArray(item.ledger)) return { balances: item.balances, operationCount: item.operations.length, ledgerCount: item.ledger.length };
    return Object.fromEntries(Object.entries(item).filter(([key]) => !['operationId', 'operation_id', 'backendPids'].includes(key)).map(([key, child]) => [key, observationSummary(child)]));
  }
  return value;
}
