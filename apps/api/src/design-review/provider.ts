import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { DesignReviewContentSchema } from '@trajectoryos/contracts';
import type { ApiConfig } from '../config.js';
import { DESIGN_REVIEW_INSTRUCTIONS } from './output.js';
import type { ExtractedDesign } from './scenes.js';

export type DesignReviewInput = { challenge: { slug: string; version: number; title: string; requirementMarkdown: string }; design: ExtractedDesign };
export type DesignReviewProviderResponse = { output: unknown; provider: string; model: string };
export interface DesignReviewProvider { review(input: DesignReviewInput, signal: AbortSignal): Promise<DesignReviewProviderResponse> }

export class OpenAIDesignReviewProvider implements DesignReviewProvider {
  private client: OpenAI;
  constructor(key: string, private model: string, client?: OpenAI) {
    this.client = client ?? new OpenAI({ apiKey: key, maxRetries: 0, timeout: 12000 });
  }
  async review(input: DesignReviewInput, signal: AbortSignal): Promise<DesignReviewProviderResponse> {
    const response = await this.client.responses.parse({
      model: this.model,
      store: false,
      reasoning: { effort: 'low' },
      max_output_tokens: 2200,
      input: [
        { role: 'system', content: DESIGN_REVIEW_INSTRUCTIONS },
        { role: 'user', content: JSON.stringify(input) },
      ],
      text: { format: zodTextFormat(DesignReviewContentSchema, 'trajectoryos_design_review') },
    }, { signal });
    if (response.status !== 'completed' || !response.output_parsed) throw new Error('MODEL_OUTPUT_UNAVAILABLE');
    return { output: response.output_parsed, provider: 'openai', model: response.model };
  }
}

export class MistralDesignReviewProvider implements DesignReviewProvider {
  constructor(private key: string, private model: string, private transport: typeof fetch = fetch) {}
  async review(input: DesignReviewInput, signal: AbortSignal): Promise<DesignReviewProviderResponse> {
    const response = await this.transport('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST', signal,
      headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2200,
        temperature: 0,
        messages: [
          { role: 'system', content: DESIGN_REVIEW_INSTRUCTIONS },
          { role: 'user', content: JSON.stringify(input) },
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'trajectoryos_design_review', strict: true, schema: z.toJSONSchema(DesignReviewContentSchema) } },
      }),
    });
    if (!response.ok) throw new Error('MODEL_REQUEST_FAILED');
    const body = await response.json() as { model?: unknown; choices?: { finish_reason?: unknown; message?: { content?: unknown } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.length > 30000 || body.choices?.[0]?.finish_reason !== 'stop') throw new Error('MODEL_OUTPUT_UNAVAILABLE');
    return { output: JSON.parse(content), provider: 'mistral', model: typeof body.model === 'string' ? body.model : this.model };
  }
}

export function configuredDesignReviewProvider(config: ApiConfig): DesignReviewProvider | null {
  if (!config.AI_ENABLED) return null;
  if (config.AI_PROVIDER === 'openai' && config.OPENAI_API_KEY && config.OPENAI_MODEL) return new OpenAIDesignReviewProvider(config.OPENAI_API_KEY, config.OPENAI_MODEL);
  if (config.AI_PROVIDER === 'mistral' && config.MISTRAL_API_KEY && config.MISTRAL_MODEL) return new MistralDesignReviewProvider(config.MISTRAL_API_KEY, config.MISTRAL_MODEL);
  return null;
}
