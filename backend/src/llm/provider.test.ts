import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { chatCompletions } = vi.hoisted(() => ({
  chatCompletions: { create: vi.fn() },
}));

vi.mock('openai', () => {
  function OpenAIMock(this: unknown) {
    return {
      chat: { completions: chatCompletions },
    };
  }
  return { default: OpenAIMock };
});

vi.mock('../config.js', () => ({
  config: {
    llm: {
      apiKey: 'test-key',
      model: 'gpt-test',
      baseUrl: undefined,
    },
  },
}));

import { chatJson } from './provider.js';

describe('chatJson', () => {
  beforeEach(() => {
    chatCompletions.create.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls the chat completion API with JSON mode and parses the response', async () => {
    chatCompletions.create.mockResolvedValue({
      choices: [{ message: { content: '{"foo":"bar"}' } }],
    });

    const result = await chatJson<{ foo: string }>('system prompt', 'user prompt');

    expect(chatCompletions.create).toHaveBeenCalledWith({
      model: 'gpt-test',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'user prompt' },
      ],
    });
    expect(result).toEqual({ foo: 'bar' });
  });

  it('throws when the model returns no content', async () => {
    chatCompletions.create.mockResolvedValue({ choices: [{}] });

    await expect(chatJson('s', 'u')).rejects.toThrow('LLM returned an empty response');
  });

  it('throws when the model returns empty string', async () => {
    chatCompletions.create.mockResolvedValue({
      choices: [{ message: { content: '' } }],
    });

    await expect(chatJson('s', 'u')).rejects.toThrow('LLM returned an empty response');
  });

  it('propagates JSON parse errors as SyntaxError', async () => {
    chatCompletions.create.mockResolvedValue({
      choices: [{ message: { content: 'not-json' } }],
    });

    await expect(chatJson('s', 'u')).rejects.toBeInstanceOf(SyntaxError);
  });
});
