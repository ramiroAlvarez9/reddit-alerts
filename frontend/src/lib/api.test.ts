import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { onboard, listBusinesses, listMatches } from './api';

const API_URL = 'http://localhost:4000';

describe('lib/api', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('onboard', () => {
    it('POSTs JSON to /api/onboarding and returns the parsed body', async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ business: { id: 'b1' }, discovery: {} }), {
          status: 201,
        }),
      );

      const result = await onboard({
        email: 'u@example.com',
        name: 'Acme',
        websiteUrl: 'https://acme.com',
        competitors: ['F5Bot'],
      });

      expect(fetchMock).toHaveBeenCalledWith(
        `${API_URL}/api/onboarding`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      const init = fetchMock.mock.calls[0]![1]!;
      const body = JSON.parse(init.body as string);
      expect(body).toEqual({
        email: 'u@example.com',
        name: 'Acme',
        websiteUrl: 'https://acme.com',
        competitors: ['F5Bot'],
      });
      expect(result.business.id).toBe('b1');
    });

    it('throws with the server-provided error message', async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Provide a websiteUrl or a theme' }), {
          status: 400,
        }),
      );

      await expect(
        onboard({ email: 'u@example.com', name: 'Acme' }),
      ).rejects.toThrow('Provide a websiteUrl or a theme');
    });
  });

  describe('listBusinesses', () => {
    it('GETs /api/businesses?email=… with URL-encoded email', async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ businesses: [] }), { status: 200 }),
      );

      await listBusinesses('u+test@example.com');

      expect(fetchMock).toHaveBeenCalledWith(
        `${API_URL}/api/businesses?email=u%2Btest%40example.com`,
        expect.any(Object),
      );
    });

    it('returns the businesses array from the response', async () => {
      const list = [{ id: 'b1' }, { id: 'b2' }];
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ businesses: list }), { status: 200 }),
      );

      const result = await listBusinesses('u@example.com');
      expect(result.businesses).toEqual(list);
    });
  });

  describe('listMatches', () => {
    it('GETs /api/matches?businessId=…', async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ matches: [] }), { status: 200 }),
      );

      await listMatches('b 1/with/slashes');

      expect(fetchMock).toHaveBeenCalledWith(
        `${API_URL}/api/matches?businessId=b%201%2Fwith%2Fslashes`,
        expect.any(Object),
      );
    });
  });

  describe('error handling', () => {
    it('falls back to status text when the error body is empty', async () => {
      fetchMock.mockResolvedValue(new Response('', { status: 500, statusText: 'Server Error' }));

      await expect(listBusinesses('u@example.com')).rejects.toThrow(/Request failed: 500/);
    });

    it('serialises zod-style error objects', async () => {
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({ error: { formErrors: ['bad'], fieldErrors: { email: ['invalid'] } } }),
          { status: 400 },
        ),
      );

      await expect(onboard({ email: 'bad', name: 'x' })).rejects.toThrow(/formErrors/);
    });
  });
});
