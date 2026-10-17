import OpenAI from "openai";
import { z } from "zod";
import { listedFiles, editablePath } from "./challenge/files.js";
import type { SandboxProvider, TestObservation } from "./provider.js";

const fileSchema = z.object({ path: z.enum(listedFiles as [string, ...string[]]) }).strict();
const writeSchema = z.object({ path: z.literal(editablePath), content: z.string().max(32768) }).strict();
const emptySchema = z.object({}).strict();
export type ToolEvent = { name: string; arguments: unknown; result: unknown; at: string };
export type AgentInput = { prompt: string; history: Array<{ prompt: string; response: string }>; sandboxId: string; provider: SandboxProvider;
  onEvent: (event: ToolEvent, source?: string) => Promise<void>; runTests: () => Promise<TestObservation> };
export type SandboxAgentLike = { run(input: AgentInput): Promise<{ response: string; model: string; inputTokens: number; outputTokens: number }> };

const tools = [
  { type: "function" as const, name: "list_files", description: "List challenge files and editability.", strict: true,
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false } },
  { type: "function" as const, name: "read_file", description: "Read a listed challenge file. Hidden tests are unavailable.", strict: true,
    parameters: { type: "object", properties: { path: { type: "string", enum: listedFiles } }, required: ["path"], additionalProperties: false } },
  { type: "function" as const, name: "write_file", description: "Replace only src/rateLimiter.ts with complete TypeScript source.", strict: true,
    parameters: { type: "object", properties: { path: { type: "string", enum: [editablePath] }, content: { type: "string" } }, required: ["path", "content"], additionalProperties: false } },
  { type: "function" as const, name: "run_visible_tests", description: "Run the reviewed visible tests in E2B. Limited to ten per session.", strict: true,
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false } },
];

export class SandboxAgent {
  private client: OpenAI;
  constructor(apiKey: string, private model: string) {
    this.client = new OpenAI({ apiKey, timeout: 30_000, maxRetries: 0 });
  }

  async run(input: AgentInput) {
    const history = input.history.slice(-4).map(item => `Learner: ${item.prompt.slice(0, 1000)}\nAssistant: ${item.response.slice(0, 1000)}`).join("\n\n");
    const instructions = `You are the limited coding assistant in an engineering debugging lab. The learner is supervising your changes. Only use the four provided tools. Only src/rateLimiter.ts is editable. Never claim you ran a tool unless you did. Visible tests are useful but incomplete; hidden tests are unavailable. Follow the README contract. Keep the response concise and candid about remaining uncertainty. Prior exchanges:\n${history}`;
    let previousResponseId: string | undefined;
    let nextInput: OpenAI.Responses.ResponseInput = [{ role: "system", content: instructions }, { role: "user", content: input.prompt }];
    const started = Date.now();
    let calls = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    for (let cycle = 0; cycle < 6; cycle++) {
      if (Date.now() - started > 180_000) throw new Error("Agent turn deadline exceeded.");
      const response = await this.client.responses.create({ model: this.model, input: nextInput, previous_response_id: previousResponseId,
        tools, max_output_tokens: 1200 });
      inputTokens += response.usage?.input_tokens ?? 0;
      outputTokens += response.usage?.output_tokens ?? 0;
      if (inputTokens > 18_000 || outputTokens > 4_000) throw new Error("Agent token budget exceeded.");
      const requested = response.output.filter(item => item.type === "function_call");
      if (requested.length === 0) return { response: response.output_text || "I could not complete a response.", model: this.model, inputTokens, outputTokens };
      previousResponseId = response.id;
      const outputs: OpenAI.Responses.ResponseInput = [];
      for (const call of requested) {
        if (++calls > 12) throw new Error("Agent tool-call budget exceeded.");
        let result: unknown;
        let source: string | undefined;
        const args = JSON.parse(call.arguments) as unknown;
        switch (call.name) {
          case "list_files": emptySchema.parse(args); result = input.provider.listFiles(); break;
          case "read_file": {
            const { path } = fileSchema.parse(args);
            result = { path, content: await input.provider.readFile(input.sandboxId, path) };
            break;
          }
          case "write_file": {
            const parsed = writeSchema.parse(args);
            result = await input.provider.writeFile(input.sandboxId, parsed.path, parsed.content);
            source = parsed.content;
            break;
          }
          case "run_visible_tests": emptySchema.parse(args); result = await input.runTests(); break;
          default: throw new Error("Model requested an unavailable tool.");
        }
        await input.onEvent({ name: call.name, arguments: call.name === "write_file" ? { path: editablePath, bytes: Buffer.byteLength(source!, "utf8") } : args,
          result: call.name === "read_file" ? { path: (args as { path: string }).path, bytes: String((result as { content: string }).content).length } : result,
          at: new Date().toISOString() }, source);
        outputs.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result).slice(0, 6000) });
      }
      nextInput = outputs;
    }
    throw new Error("Agent tool-cycle budget exceeded.");
  }
}