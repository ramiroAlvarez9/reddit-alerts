import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('config', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('reads required env vars and exposes them under the expected keys', async () => {
    process.env.SUPABASE_URL = 'https://sb.example.com';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sk_test';
    process.env.REDDIT_CLIENT_ID = 'cid';
    process.env.REDDIT_CLIENT_SECRET = 'csec';
    process.env.LLM_API_KEY = 'sk-llm';
    process.env.PORT = '5050';
    process.env.CORS_ORIGIN = 'http://test:1234';
    process.env.LLM_BASE_URL = 'http://localhost:11434/v1';
    process.env.LLM_DAILY_CALL_LIMIT = '99';

    const { config } = await import('./config.js');

    expect(config.port).toBe(5050);
    expect(config.corsOrigin).toBe('http://test:1234');
    expect(config.supabase.url).toBe('https://sb.example.com');
    expect(config.supabase.serviceRoleKey).toBe('sk_test');
    expect(config.reddit.clientId).toBe('cid');
    expect(config.reddit.clientSecret).toBe('csec');
    expect(config.llm.apiKey).toBe('sk-llm');
    expect(config.llm.baseUrl).toBe('http://localhost:11434/v1');
    expect(config.llm.dailyCallLimit).toBe(99);
  });

  it('falls back to defaults when optional env vars are missing', async () => {
    process.env.SUPABASE_URL = 'x';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'x';
    process.env.REDDIT_CLIENT_ID = 'x';
    process.env.REDDIT_CLIENT_SECRET = 'x';
    process.env.LLM_API_KEY = 'x';
    delete process.env.PORT;
    delete process.env.CORS_ORIGIN;
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_DAILY_CALL_LIMIT;
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;

    const { config } = await import('./config.js');

    expect(config.port).toBe(4000);
    expect(config.corsOrigin).toBe('http://localhost:5173');
    expect(config.llm.baseUrl).toBeUndefined();
    expect(config.llm.dailyCallLimit).toBe(200);
    expect(config.email.resendApiKey).toBe('');
    expect(config.email.from).toBe('alerts@example.com');
  });

  it('throws a descriptive error when a required env var is missing', async () => {
    process.env.SUPABASE_URL = 'x';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'x';
    process.env.REDDIT_CLIENT_ID = 'x';
    process.env.REDDIT_CLIENT_SECRET = 'x';
    process.env.LLM_API_KEY = 'x';
    delete process.env.SUPABASE_URL;

    await expect(import('./config.js')).rejects.toThrow(
      'Missing required environment variable: SUPABASE_URL',
    );
  });
});
