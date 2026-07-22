import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const { config, supabase, scanAllBusinesses, onboardBusiness } = vi.hoisted(() => ({
  config: {
    port: 0,
    corsOrigin: 'http://localhost:5173',
    supabase: { url: 'x', serviceRoleKey: 'x' },
    reddit: { clientId: 'x', clientSecret: 'x', userAgent: 'x' },
    llm: { apiKey: 'x', model: 'x', baseUrl: undefined, dailyCallLimit: 0 },
    email: { resendApiKey: undefined, from: 'x' },
  },
  supabase: { from: vi.fn() },
  scanAllBusinesses: vi.fn(),
  onboardBusiness: vi.fn(),
}));

vi.mock('./config.js', () => ({ config }));
vi.mock('./db.js', () => ({ supabase }));
vi.mock('./services/scan.js', () => ({ scanAllBusinesses }));
vi.mock('./services/onboarding.js', () => ({ onboardBusiness }));

import { createApp } from './app.js';

describe('app wiring', () => {
  it('exposes a /health endpoint', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('mounts the three API routers', async () => {
    const app = createApp();
    supabase.from.mockImplementation(() => ({ select: () => ({ single: () => ({ data: null, error: null }) }) }));

    const onboarding = await request(app).post('/api/onboarding').send({});
    expect(onboarding.status).toBe(400);

    const businesses = await request(app).get('/api/businesses');
    expect(businesses.status).toBe(400);

    const matches = await request(app).get('/api/matches');
    expect(matches.status).toBe(400);
  });
});
