import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const { supabase, scanAllBusinesses } = vi.hoisted(() => ({
  supabase: { from: vi.fn() },
  scanAllBusinesses: vi.fn(),
}));

vi.mock('../db.js', () => ({ supabase }));
vi.mock('../services/scan.js', () => ({ scanAllBusinesses }));

import { businessesRouter } from './businesses.js';
import { makeChain } from '../test/supabase-mock.js';
import express from 'express';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/businesses', businessesRouter);
  return app;
}

describe('GET /api/businesses', () => {
  beforeEach(() => {
    supabase.from.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 400 when the email query param is missing', async () => {
    const res = await request(buildApp()).get('/api/businesses');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('email query param is required');
  });

  it('returns an empty list when the user is not found', async () => {
    supabase.from.mockImplementation(() =>
      makeChain({ single: { data: null, error: null } }),
    );

    const res = await request(buildApp()).get('/api/businesses?email=ghost@example.com');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ businesses: [] });
  });

  it('returns the businesses for the user, ordered by created_at desc', async () => {
    const list = [
      { id: 'b1', name: 'Newer', created_at: '2025-02-01T00:00:00Z' },
      { id: 'b2', name: 'Older', created_at: '2025-01-01T00:00:00Z' },
    ];

    let usersLookedUp = 0;
    supabase.from.mockImplementation((table: string) => {
      if (table === 'users') {
        usersLookedUp += 1;
        return makeChain({ single: { data: { id: 'u1' }, error: null } });
      }
      if (table === 'businesses') {
        return makeChain({ await: { data: list, error: null } });
      }
      return makeChain();
    });

    const res = await request(buildApp()).get('/api/businesses?email=u@example.com');

    expect(res.status).toBe(200);
    expect(usersLookedUp).toBe(1);
    expect(res.body.businesses).toEqual(list);
  });

  it('returns 500 when the businesses query errors', async () => {
    supabase.from.mockImplementation((table: string) => {
      if (table === 'users') {
        return makeChain({ single: { data: { id: 'u1' }, error: null } });
      }
      if (table === 'businesses') {
        return makeChain({ await: { data: null, error: { message: 'timeout' } } });
      }
      return makeChain();
    });

    const res = await request(buildApp()).get('/api/businesses?email=u@example.com');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('timeout');
  });
});

describe('POST /api/businesses/scan', () => {
  beforeEach(() => {
    scanAllBusinesses.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the new match count from scanAllBusinesses', async () => {
    scanAllBusinesses.mockResolvedValue(7);

    const res = await request(buildApp()).post('/api/businesses/scan');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ newMatches: 7 });
  });

  it('returns 500 when scanAllBusinesses throws', async () => {
    scanAllBusinesses.mockRejectedValue(new Error('scan failed'));

    const res = await request(buildApp()).post('/api/businesses/scan');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('scan failed');
  });
});
