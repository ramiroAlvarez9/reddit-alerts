import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const { supabase, onboardBusiness } = vi.hoisted(() => ({
  supabase: { from: vi.fn() },
  onboardBusiness: vi.fn(),
}));

vi.mock('../db.js', () => ({ supabase }));
vi.mock('../services/onboarding.js', () => ({ onboardBusiness }));

import { onboardingRouter } from './onboarding.js';
import { makeChain } from '../test/supabase-mock.js';
import express from 'express';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/onboarding', onboardingRouter);
  return app;
}

const validBody = {
  email: 'user@example.com',
  name: 'Acme',
  websiteUrl: 'https://acme.com',
};

describe('POST /api/onboarding', () => {
  beforeEach(() => {
    supabase.from.mockReset();
    onboardBusiness.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 400 when the body fails zod validation', async () => {
    const res = await request(buildApp())
      .post('/api/onboarding')
      .send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 when both websiteUrl and theme are missing', async () => {
    const res = await request(buildApp())
      .post('/api/onboarding')
      .send({ email: 'user@example.com', name: 'Acme' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Provide a websiteUrl or a theme');
  });

  it('returns 500 when the user upsert fails', async () => {
    supabase.from.mockImplementation(() =>
      makeChain({ single: { data: null, error: { message: 'duplicate' } } }),
    );

    const res = await request(buildApp())
      .post('/api/onboarding')
      .send(validBody);

    expect(res.status).toBe(500);
    expect(res.body.error).toContain('User upsert failed: duplicate');
  });

  it('upserts the user by email and calls onboardBusiness with the right args', async () => {
    supabase.from.mockImplementation((table: string) => {
      if (table === 'users') {
        return makeChain({ single: { data: { id: 'u1' }, error: null } });
      }
      return makeChain();
    });
    onboardBusiness.mockResolvedValue({
      business: { id: 'b1' },
      discovery: { profile: {}, subreddits: [], keywords: [] },
    });

    const res = await request(buildApp())
      .post('/api/onboarding')
      .send({
        ...validBody,
        theme: 'reddit alerts',
        problemsSolved: 'manual scanning',
        competitors: ['F5Bot', 'GummySearch'],
      });

    expect(res.status).toBe(201);
    expect(onboardBusiness).toHaveBeenCalledWith({
      userId: 'u1',
      name: 'Acme',
      websiteUrl: 'https://acme.com',
      theme: 'reddit alerts',
      problemsSolved: 'manual scanning',
      competitors: ['F5Bot', 'GummySearch'],
    });
  });

  it('returns 500 when onboardBusiness throws', async () => {
    supabase.from.mockImplementation(() =>
      makeChain({ single: { data: { id: 'u1' }, error: null } }),
    );
    onboardBusiness.mockRejectedValue(new Error('LLM down'));

    const res = await request(buildApp()).post('/api/onboarding').send(validBody);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('LLM down');
  });
});
