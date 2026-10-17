import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { ApiConfig } from "../config.js";
import { CAREER_INSTRUCTIONS, CareerModelOutputSchema, type CareerProviderInput } from "./output.js";

export type CareerProviderResponse = { output: unknown; provider: string; model: string };
export interface CareerAnalysisProvider {
  analyze(input: CareerProviderInput, signal: AbortSignal): Promise<CareerProviderResponse>;
}

export class OpenAICareerAnalysisProvider implements CareerAnalysisProvider {
  private client: OpenAI;
  constructor(key: string, private model: string, client?: OpenAI) {
    this.client = client ?? new OpenAI({ apiKey: key, maxRetries: 0, timeout: 12000 });
  }
  async analyze(input: CareerProviderInput, signal: AbortSignal): Promise<CareerProviderResponse> {
    const response = await this.client.responses.parse({
      model: this.model,
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 1800,
      input: [
        { role: "system", content: CAREER_INSTRUCTIONS },
        { role: "user", content: JSON.stringify(input) },
      ],
      text: { format: zodTextFormat(CareerModelOutputSchema, "career_review") },
    }, { signal });
    if (response.status !== "completed" || !response.output_parsed) throw new Error("MODEL_OUTPUT_UNAVAILABLE");
    return { output: response.output_parsed, provider: "openai", model: response.model };
  }
}

export class MistralCareerAnalysisProvider implements CareerAnalysisProvider {
  constructor(private key: string, private model: string, private transport: typeof fetch = fetch) {}
  async analyze(input: CareerProviderInput, signal: AbortSignal): Promise<CareerProviderResponse> {
    const response = await this.transport("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      signal,
      headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1600,
        temperature: 0,
        messages: [
          { role: "system", content: CAREER_INSTRUCTIONS },
          { role: "user", content: JSON.stringify(input) },
        ],
        response_format: { type: "json_schema", json_schema: {
          name: "career_review", strict: true, schema: z.toJSONSchema(CareerModelOutputSchema),
        } },
      }),
    });
    if (!response.ok) throw Object.assign(new Error("MODEL_REQUEST_FAILED"), { status: response.status });
    const body = await response.json() as any;
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length > 30000 || body.choices?.[0]?.finish_reason !== "stop") {
      throw new Error("MODEL_OUTPUT_UNAVAILABLE");
    }
    return { output: JSON.parse(content), provider: "mistral", model: typeof body.model === "string" ? body.model : this.model };
  }
}

export function configuredCareerProvider(config: ApiConfig): CareerAnalysisProvider | null {
  if (!config.AI_ENABLED) return null;
  if (config.AI_PROVIDER === "openai" && config.OPENAI_API_KEY && config.OPENAI_MODEL) {
    return new OpenAICareerAnalysisProvider(config.OPENAI_API_KEY, config.OPENAI_MODEL);
  }
  if (config.AI_PROVIDER === "mistral" && config.MISTRAL_API_KEY && config.MISTRAL_MODEL) {
    return new MistralCareerAnalysisProvider(config.MISTRAL_API_KEY, config.MISTRAL_MODEL);
  }
  return null;
}
