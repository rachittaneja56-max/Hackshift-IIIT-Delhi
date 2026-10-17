import type { CreditVariant } from "./types.js";
import { complete, credit, replay, reserve } from "./shared.js";
// Deliberately faulty: the balance write commits before checking/reserving the key.
export const creditFirst: CreditVariant = async (client, input, hooks) => {
  const balance = await credit(client, input);
  hooks?.afterBalance?.();
  const operationId = await reserve(client, input);
  if (!operationId) return replay(client, input);
  return complete(client, input, operationId, balance);
};
