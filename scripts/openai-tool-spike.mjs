import OpenAI from 'openai';
import { config as loadEnv } from 'dotenv';

if (process.env.SPIKE_ENV_PATH) loadEnv({ path: process.env.SPIKE_ENV_PATH });
if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required on the host');
const model = process.env.SANDBOX_AGENT_MODEL || 'gpt-6-luna';
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 30_000, maxRetries: 0 });
const started = performance.now();
const response = await client.responses.create({
  model,
  input: 'Call list_files to inspect the available project files before giving advice.',
  max_output_tokens: 300,
  tools: [{ type: 'function', name: 'list_files', description: 'List permitted project files.', strict: true,
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false } }],
  tool_choice: { type: 'function', name: 'list_files' },
});
console.log(JSON.stringify({ model, responseId: response.id, durationMs: Math.round(performance.now() - started),
  calls: response.output.filter(item => item.type === 'function_call').map(item => ({ name: item.name, arguments: item.arguments })),
  usage: response.usage }, null, 2));
if (!response.output.some(item => item.type === 'function_call' && item.name === 'list_files')) process.exitCode = 1;
