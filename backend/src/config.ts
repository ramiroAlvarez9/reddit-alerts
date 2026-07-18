import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export const config = {
  port: Number(optional('PORT', '4000')),
  corsOrigin: optional('CORS_ORIGIN', 'http://localhost:5173'),

  supabase: {
    url: required('SUPABASE_URL'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  },

  reddit: {
    clientId: required('REDDIT_CLIENT_ID'),
    clientSecret: required('REDDIT_CLIENT_SECRET'),
    userAgent: optional('REDDIT_USER_AGENT', 'reddit-alerts/0.1'),
  },

  llm: {
    apiKey: required('LLM_API_KEY'),
    model: optional('LLM_MODEL', 'gpt-4o-mini'),
    baseUrl: optional('LLM_BASE_URL') || undefined,
    dailyCallLimit: Number(optional('LLM_DAILY_CALL_LIMIT', '200')),
  },

  email: {
    resendApiKey: optional('RESEND_API_KEY'),
    from: optional('EMAIL_FROM', 'alerts@example.com'),
  },
} as const;
