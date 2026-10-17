import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { ApiConfig } from "../config.js";
import { FeedbackOutputSchema, FEEDBACK_INSTRUCTIONS, type FeedbackInput } from "./output.js";

export type ProviderResponse = { output: unknown; provider: string; model: string; usage: unknown };
export interface FeedbackProvider { explain(input: FeedbackInput, signal: AbortSignal): Promise<ProviderResponse> }
export class OpenAIFeedbackProvider implements FeedbackProvider {
  private client: OpenAI;
  constructor(key: string, private model: string, client?: OpenAI) {
    this.client = client ?? new OpenAI({ apiKey: key, maxRetries: 0, timeout: 12000 });
  }
  async explain(input: FeedbackInput, signal: AbortSignal): Promise<ProviderResponse> {
    const response = await this.client.responses.parse({ model: this.model, store: false,
      reasoning: { effort: "low" }, max_output_tokens: 1400,
      input: [{ role: "system", content: FEEDBACK_INSTRUCTIONS }, { role: "user", content: JSON.stringify(input) }],
      text: { format: zodTextFormat(FeedbackOutputSchema, "evidence_feedback") },
    }, { signal });
    if (response.status !== "completed" || !response.output_parsed) throw new Error("MODEL_OUTPUT_UNAVAILABLE");
    return { output: response.output_parsed, provider: "openai", model: response.model, usage: response.usage ?? null };
  }
}
export class MistralFeedbackProvider implements FeedbackProvider {
  constructor(private key: string, private model: string, private transport: typeof fetch = fetch) {}
  async explain(input: FeedbackInput, signal: AbortSignal): Promise<ProviderResponse> {
    const response = await this.transport("https://api.mistral.ai/v1/chat/completions", { method: "POST", signal,
      headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, max_tokens: 1000, temperature: 0,
        messages: [{ role: "system", content: FEEDBACK_INSTRUCTIONS }, { role: "user", content: JSON.stringify(input) }],
        response_format: { type: "json_schema", json_schema: { name: "evidence_feedback", strict: true, schema: z.toJSONSchema(FeedbackOutputSchema) } } }) });
    if (!response.ok) throw new Error("MODEL_REQUEST_FAILED");
    const body = await response.json() as any;
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length > 20000 || body.choices?.[0]?.finish_reason !== "stop") throw new Error("MODEL_OUTPUT_UNAVAILABLE");
    return { output: JSON.parse(content), provider: "mistral", model: typeof body.model === "string" ? body.model : this.model, usage: body.usage ?? null };
  }
}
export function configuredProvider(config: ApiConfig): FeedbackProvider | null {
  if (!config.AI_ENABLED) return null;
  if (config.AI_PROVIDER === "openai" && config.OPENAI_API_KEY && config.OPENAI_MODEL) return new OpenAIFeedbackProvider(config.OPENAI_API_KEY, config.OPENAI_MODEL);
  if (config.AI_PROVIDER === "mistral" && config.MISTRAL_API_KEY && config.MISTRAL_MODEL) return new MistralFeedbackProvider(config.MISTRAL_API_KEY, config.MISTRAL_MODEL);
  return null;
}
