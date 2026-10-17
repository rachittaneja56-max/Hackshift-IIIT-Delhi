import type { PoolClient } from "pg";
export type CreditInput = { runId: string; scenario: string; accountId: string; key: string; amountMinor: number };
export type CreditResponse = { status: number; body: { operationId?: string; amountMinor?: number; balanceMinor?: number; error?: string } };
export type CreditHooks = { afterBalance?: () => void };
export type CreditVariant = (client: PoolClient, input: CreditInput, hooks?: CreditHooks) => Promise<CreditResponse>;
