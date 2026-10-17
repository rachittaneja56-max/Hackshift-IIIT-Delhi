import type { CreditVariant } from "./types.js";
import { complete, credit, replay, reserve } from "./shared.js";
// Deliberately faulty: reservation, balance, ledger and response commit separately.
export const keyOnly: CreditVariant = async (client, input, hooks) => {
  const operationId = await reserve(client, input);
  if (!operationId) return replay(client, input);
  const balance = await credit(client, input);
  hooks?.afterBalance?.();
  return complete(client, input, operationId, balance);
};
