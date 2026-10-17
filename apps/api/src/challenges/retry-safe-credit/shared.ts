import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { sha256 } from "../../db/hash.js";
import type { CreditInput, CreditResponse } from "./types.js";
export function payloadHash(input: CreditInput) { return sha256({ accountId: input.accountId, amountMinor: input.amountMinor }); }
export async function reserve(client: PoolClient, input: CreditInput) {
  const result = await client.query(`INSERT INTO challenge_eval.operations
    (run_id,scenario,account_id,key,operation_id,payload_hash) VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (run_id,scenario,account_id,key) DO NOTHING RETURNING operation_id`,
    [input.runId, input.scenario, input.accountId, input.key, randomUUID(), payloadHash(input)]);
  return result.rows[0]?.operation_id as string | undefined;
}
export async function replay(client: PoolClient, input: CreditInput): Promise<CreditResponse> {
  const row = (await client.query(`SELECT payload_hash,response FROM challenge_eval.operations
    WHERE run_id=$1 AND scenario=$2 AND account_id=$3 AND key=$4`, [input.runId, input.scenario, input.accountId, input.key])).rows[0];
  if (row.payload_hash !== payloadHash(input)) return { status: 409, body: { error: "PAYLOAD_CONFLICT" } };
  return row.response ?? { status: 503, body: { error: "OPERATION_INCOMPLETE" } };
}
export async function credit(client: PoolClient, input: CreditInput) {
  const row = (await client.query(`UPDATE challenge_eval.accounts SET balance_minor=balance_minor+$4
    WHERE run_id=$1 AND scenario=$2 AND account_id=$3 RETURNING balance_minor`,
    [input.runId, input.scenario, input.accountId, input.amountMinor])).rows[0];
  if (!row) throw new Error("Fixture account missing");
  return Number(row.balance_minor);
}
export async function complete(client: PoolClient, input: CreditInput, operationId: string, balanceMinor: number): Promise<CreditResponse> {
  const response: CreditResponse = { status: 201, body: { operationId, amountMinor: input.amountMinor, balanceMinor } };
  await client.query(`INSERT INTO challenge_eval.ledger(run_id,scenario,account_id,operation_id,amount_minor)
    VALUES ($1,$2,$3,$4,$5)`, [input.runId, input.scenario, input.accountId, operationId, input.amountMinor]);
  await client.query(`UPDATE challenge_eval.operations SET response=$5 WHERE run_id=$1 AND scenario=$2 AND account_id=$3 AND key=$4`,
    [input.runId, input.scenario, input.accountId, input.key, response]);
  return response;
}
