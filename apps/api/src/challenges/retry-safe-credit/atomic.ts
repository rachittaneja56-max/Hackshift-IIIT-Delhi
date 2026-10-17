import type { CreditVariant } from "./types.js";
import { complete, credit, replay, reserve } from "./shared.js";
// Every database effect and the persisted response share this checked-out client.
export const atomic: CreditVariant = async (client, input, hooks) => {
  await client.query("BEGIN");
  try {
    const operationId = await reserve(client, input);
    const response = operationId ? await (async () => {
      const balance = await credit(client, input);
      hooks?.afterBalance?.();
      return complete(client, input, operationId, balance);
    })() : await replay(client, input);
    await client.query("COMMIT");
    return response;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
};
