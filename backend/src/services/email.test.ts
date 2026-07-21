import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { config } = vi.hoisted(() => ({
  config: {
    email: {
      resendApiKey: 're_test_key',
      from: 'alerts@example.com',
    },
  },
}));

vi.mock('../config.js', () => ({ config }));

import { sendDigestEmail } from './email.js';
import type { Match } from '../types.js';

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 'm1',
    business_id: 'b1',
    reddit_post_id: 'p1',
    subreddit: 'SaaS',
    title: 'Looking for a tool',
    body: 'body',
    url: 'https://reddit.com/r/SaaS/comments/p1',
    permalink: 'https://www.reddit.com/r/SaaS/comments/p1/looking',
    author: 'alice',
    created_utc: 1_700_000_000,
    intent: 'high',
    tags: ['Asked Recommendation'],
    reply_draft: 'try us',
    reason: 'clear intent',
    notified_at: null,
    created_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('sendDigestEmail', () => {
  let fetchMock: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  const originalKey = config.email.resendApiKey;

  beforeEach(() => {
    config.email.resendApiKey = originalKey;
    fetchMock = vi.spyOn(globalThis, 'fetch');
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    fetchMock.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('returns false and skips fetch when RESEND_API_KEY is missing', async () => {
    config.email.resendApiKey = '';

    const sent = await sendDigestEmail('user@example.com', [makeMatch()]);

    expect(sent).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('RESEND_API_KEY not set'),
    );
  });

  it('returns false when there are no matches', async () => {
    const sent = await sendDigestEmail('user@example.com', []);
    expect(sent).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs a digest payload to Resend and returns true on 2xx', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"id":"abc"}', { status: 200 }));

    const sent = await sendDigestEmail('user@example.com', [
      makeMatch(),
      makeMatch({ id: 'm2', title: 'Second <post>' }),
    ]);

    expect(sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect((init as RequestInit).method).toBe('POST');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer re_test_key');
    expect(headers['Content-Type']).toBe('application/json');

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.from).toBe('alerts@example.com');
    expect(body.to).toBe('user@example.com');
    expect(body.subject).toBe('2 new Reddit lead(s) for your business');
    expect(body.html).toContain('Looking for a tool');
    expect(body.html).toContain('r/SaaS');
    expect(body.html).toContain('Second &lt;post&gt;');
    expect(body.html).toContain('intent: high');
    expect(body.html).toContain('Asked Recommendation');
  });

  it('returns false and logs an error when Resend returns a non-2xx', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('quota exceeded', { status: 429, statusText: 'Too Many Requests' }),
    );

    const sent = await sendDigestEmail('user@example.com', [makeMatch()]);

    expect(sent).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(
      '[email] Resend send failed:',
      429,
      'quota exceeded',
    );
  });
});
