import OpenAI from 'openai';
import { config } from '../config.js';

/**
 * Thin wrapper around an OpenAI-compatible chat completion API.
 * The app owns a single generic key (config.llm.apiKey); it is only ever used
 * server-side and never exposed to the frontend. Swap the base URL to target
 * another OpenAI-compatible runner (Ollama, vLLM, ...).
 */
const client = new OpenAI({
  apiKey: config.llm.apiKey,
  baseURL: config.llm.baseUrl,
});

export async function chatJson<T>(system: string, user: string): Promise<T> {
  const completion = await client.chat.completions.create({
    model: config.llm.model,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error('LLM returned an empty response');
  }
  return JSON.parse(content) as T;
}
