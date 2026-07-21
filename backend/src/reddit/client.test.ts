import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { config } = vi.hoisted(() => ({
  config: {
    reddit: {
      clientId: 'cid',
      clientSecret: 'csec',
      userAgent: 'ua-test',
    },
  },
}));

vi.mock('../config.js', () => ({ config }));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const listing = (children: unknown[]) => ({ data: { children } });

const child = (overrides: Record<string, unknown> = {}) => ({
  data: {
    id: 'abc',
    subreddit: 'SaaS',
    title: 'Looking for a tool',
    selftext: 'body text',
    permalink: '/r/SaaS/comments/abc/looking_for_a_tool',
    url: 'https://example.com/x',
    author: 'alice',
    created_utc: 1_700_000_000,
    ...overrides,
  },
});

async function loadClient() {
  return import('./client.js');
}

describe('reddit/client', () => {
  let fetchMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    fetchMock = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  describe('fetchNewPosts', () => {
    it('obtains a token, then GETs /r/{sub}/new and maps the listing', async () => {
      const { fetchNewPosts } = await loadClient();
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
        .mockResolvedValueOnce(
          jsonResponse(
            listing([
              child({ id: 'p1', selftext: null }),
              child({ id: 'p2', selftext: 'real body' }),
            ]),
          ),
        );

      const posts = await fetchNewPosts('SaaS', 10);

      expect(posts).toHaveLength(2);
      expect(posts[0]).toMatchObject({
        id: 'p1',
        subreddit: 'SaaS',
        title: 'Looking for a tool',
        selftext: '',
        permalink: 'https://www.reddit.com/r/SaaS/comments/abc/looking_for_a_tool',
        url: 'https://example.com/x',
        author: 'alice',
        created_utc: 1_700_000_000,
      });
      expect(posts[1]!.selftext).toBe('real body');

      const tokenCall = fetchMock.mock.calls[0]!;
      expect(tokenCall[0]).toBe('https://www.reddit.com/api/v1/access_token');
      const tokenInit = tokenCall[1]!;
      expect(tokenInit.method).toBe('POST');
      const auth = tokenInit.headers as Record<string, string>;
      const expectedBasic = Buffer.from('cid:csec').toString('base64');
      expect(auth.Authorization).toBe(`Basic ${expectedBasic}`);
      expect(auth['User-Agent']).toBe('ua-test');
      expect(tokenInit.body).toBe('grant_type=client_credentials');

      const listCall = fetchMock.mock.calls[1]!;
      expect(listCall[0]).toBe('https://oauth.reddit.com/r/SaaS/new?limit=10');
      const listHeaders = (listCall[1] as RequestInit).headers as Record<string, string>;
      expect(listHeaders.Authorization).toBe('Bearer tok-1');
      expect(listHeaders['User-Agent']).toBe('ua-test');
    });

    it('uses the default limit of 25', async () => {
      const { fetchNewPosts } = await loadClient();
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
        .mockResolvedValueOnce(jsonResponse(listing([])));

      await fetchNewPosts('SaaS');

      const listUrl = fetchMock.mock.calls[1]![0] as string;
      expect(listUrl).toContain('?limit=25');
    });

    it('throws when the token request fails', async () => {
      const { fetchNewPosts } = await loadClient();
      fetchMock.mockResolvedValueOnce(
        new Response('nope', { status: 401, statusText: 'Unauthorized' }),
      );

      await expect(fetchNewPosts('SaaS')).rejects.toThrow(/Reddit auth failed: 401/);
    });

    it('throws when the listing request fails', async () => {
      const { fetchNewPosts } = await loadClient();
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
        .mockResolvedValueOnce(
          new Response('boom', { status: 500, statusText: 'Server Error' }),
        );

      await expect(fetchNewPosts('SaaS')).rejects.toThrow(/Reddit request failed: 500/);
    });

    it('URL-encodes the subreddit name', async () => {
      const { fetchNewPosts } = await loadClient();
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
        .mockResolvedValueOnce(jsonResponse(listing([])));

      await fetchNewPosts('sub with space');

      expect(fetchMock.mock.calls[1]![0]).toBe(
        'https://oauth.reddit.com/r/sub%20with%20space/new?limit=25',
      );
    });
  });

  describe('token caching', () => {
    it('reuses a valid cached token on subsequent calls', async () => {
      const { fetchNewPosts } = await loadClient();
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
        .mockResolvedValueOnce(jsonResponse(listing([child()])))
        .mockResolvedValueOnce(jsonResponse(listing([child()])));

      await fetchNewPosts('SaaS');
      await fetchNewPosts('startups');

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock.mock.calls[0]![0]).toBe('https://www.reddit.com/api/v1/access_token');
      expect(fetchMock.mock.calls[1]![0]).toBe('https://oauth.reddit.com/r/SaaS/new?limit=25');
      expect(fetchMock.mock.calls[2]![0]).toBe('https://oauth.reddit.com/r/startups/new?limit=25');
    });

    it('refetches the token when the cached one is within 30s of expiring', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));

      const { fetchNewPosts } = await loadClient();
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 60 }))
        .mockResolvedValueOnce(jsonResponse(listing([child()])));

      await fetchNewPosts('SaaS');

      vi.setSystemTime(new Date('2025-01-01T00:00:31Z'));
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-2', expires_in: 3600 }))
        .mockResolvedValueOnce(jsonResponse(listing([child()])));

      await fetchNewPosts('SaaS');

      vi.useRealTimers();

      const tokenCalls = fetchMock.mock.calls.filter(
        (c) => c[0] === 'https://www.reddit.com/api/v1/access_token',
      );
      expect(tokenCalls).toHaveLength(2);
    });
  });

  describe('searchSubreddit', () => {
    it('queries /r/{sub}/search with restrict_sr=1 and sorts by new', async () => {
      const { searchSubreddit } = await loadClient();
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
        .mockResolvedValueOnce(jsonResponse(listing([child()])));

      const posts = await searchSubreddit('SaaS', 'crm', 5);

      expect(posts).toHaveLength(1);
      const url = fetchMock.mock.calls[1]![0] as string;
      expect(url).toBe(
        'https://oauth.reddit.com/r/SaaS/search?q=crm&restrict_sr=1&sort=new&limit=5&t=week',
      );
    });
  });

  describe('searchSubreddits', () => {
    it('queries /subreddits/search and returns display names', async () => {
      const { searchSubreddits } = await loadClient();
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
        .mockResolvedValueOnce(
          jsonResponse({
            data: {
              children: [
                { data: { display_name: 'SaaS', subscribers: 100_000 } },
                { data: { display_name: 'startups', subscribers: null } },
              ],
            },
          }),
        );

      const names = await searchSubreddits('startup', 10);

      expect(names).toEqual(['SaaS', 'startups']);
      const url = fetchMock.mock.calls[1]![0] as string;
      expect(url).toBe('https://oauth.reddit.com/subreddits/search?q=startup&limit=10');
    });
  });
});
