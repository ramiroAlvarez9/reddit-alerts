import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const { supabase } = vi.hoisted(() => ({ supabase: { from: vi.fn() } }));

vi.mock('../db.js', () => ({ supabase }));

import { matchesRouter } from './matches.js';
import { makeChain } from '../test/supabase-mock.js';
import express from 'express';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/matches', matchesRouter);
  return app;
}

describe('GET /api/matches', () => {
  beforeEach(() => {
    supabase.from.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 400 when businessId is missing', async () => {
    const res = await request(buildApp()).get('/api/matches');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('businessId query param is required');
  });

  it('returns matches newest first, capped at 200', async () => {
    const orderSpy = vi.fn().mockReturnThis();
    supabase.from.mockImplementation(() => {
      const chain = makeChain({
        await: { data: [{ id: 'm1' }, { id: 'm2' }], error: null },
      });
      chain.order = orderSpy;
      return chain;
    });

    const res = await request(buildApp()).get('/api/matches?businessId=b1');

    expect(res.status).toBe(200);
    expect(res.body.matches).toEqual([{ id: 'm1' }, { id: 'm2' }]);
    expect(orderSpy).toHaveBeenCalledWith('created_utc', { ascending: false });
    expect((orderSpy.mock.results[0]!.value as { limit: ReturnType<typeof vi.fn> }).limit).toBeDefined();
  });

  it('returns 500 when the query errors', async () => {
    supabase.from.mockImplementation(() =>
      makeChain({ await: { data: null, error: { message: 'db down' } } }),
    );

    const res = await request(buildApp()).get('/api/matches?businessId=b1');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('db down');
  });
});
