import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase, fetchNewPosts, searchSubreddit, scorePost, sendDigestEmail } = vi.hoisted(
  () => ({
    supabase: { from: vi.fn() },
    fetchNewPosts: vi.fn(),
    searchSubreddit: vi.fn(),
    scorePost: vi.fn(),
    sendDigestEmail: vi.fn(),
  }),
);

vi.mock('../db.js', () => ({ supabase }));
vi.mock('../reddit/client.js', () => ({ fetchNewPosts, searchSubreddit }));
vi.mock('../llm/scoring.js', () => ({ scorePost }));
vi.mock('./email.js', () => ({ sendDigestEmail }));

import { scanAllBusinesses } from './scan.js';
import { makeChain } from '../test/supabase-mock.js';
import type { Business, Match, RedditPost } from '../types.js';

function makeBusiness(overrides: Partial<Business> = {}): Business {
  return {
    id: 'b1',
    user_id: 'u1',
    name: 'Acme',
    website_url: null,
    theme: 'reddit alerts',
    problems_solved: 'manual scanning',
    competitors: ['F5Bot'],
    profile: {
      valueProposition: 'Find leads',
      audience: 'SaaS founders',
      painsSolved: ['scanning'],
    },
    created_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function makePost(overrides: Partial<RedditPost> = {}): RedditPost {
  return {
    id: 'p1',
    subreddit: 'SaaS',
    title: 'Looking for a tool',
    selftext: 'body',
    permalink: 'https://reddit.com/r/SaaS/comments/p1',
    url: 'https://reddit.com/r/SaaS/comments/p1',
    author: 'alice',
    created_utc: 1_700_000_000,
    ...overrides,
  };
}

function makeMatchRow(overrides: Partial<Match> = {}): Match {
  return {
    id: 'm1',
    business_id: 'b1',
    reddit_post_id: 'p1',
    subreddit: 'SaaS',
    title: 'Looking for a tool',
    body: 'body',
    url: 'https://reddit.com/r/SaaS/comments/p1',
    permalink: 'https://reddit.com/r/SaaS/comments/p1',
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

describe('scanAllBusinesses', () => {
  beforeEach(() => {
    supabase.from.mockReset();
    fetchNewPosts.mockReset();
    searchSubreddit.mockReset();
    scorePost.mockReset();
    sendDigestEmail.mockReset();
  });

  it('returns 0 when the businesses query errors', async () => {
    supabase.from.mockImplementation(() =>
      makeChain({ await: { data: null, error: { message: 'db down' } } }),
    );

    await expect(scanAllBusinesses()).rejects.toThrow(
      'Failed to load businesses: db down',
    );
  });

  it('skips businesses without a profile', async () => {
    supabase.from.mockImplementation((table: string) => {
      if (table === 'businesses') {
        return makeChain({ await: { data: [makeBusiness({ profile: null })], error: null } });
      }
      return makeChain();
    });

    const count = await scanAllBusinesses();
    expect(count).toBe(0);
    expect(fetchNewPosts).not.toHaveBeenCalled();
  });

  it('skips businesses without subreddits', async () => {
    supabase.from.mockImplementation((table: string) => {
      if (table === 'businesses') {
        return makeChain({ await: { data: [makeBusiness()], error: null } });
      }
      if (table === 'subreddits' || table === 'keywords') {
        return makeChain({ await: { data: [], error: null } });
      }
      return makeChain();
    });

    const count = await scanAllBusinesses();
    expect(count).toBe(0);
  });

  it('dedupes candidate posts across /new and keyword searches and inserts only new ones', async () => {
    const newPost = makePost({ id: 'p-new', title: 'New post' });
    const existingPost = makePost({ id: 'p-existing', title: 'Old post' });
    const irrelevantPost = makePost({ id: 'p-irrelevant', title: 'Off topic' });

    fetchNewPosts.mockResolvedValueOnce([newPost, existingPost]);
    searchSubreddit.mockResolvedValueOnce([newPost, irrelevantPost]);

    scorePost.mockImplementation(async (_p, _c, post) => {
      if (post.id === 'p-new') {
        return {
          relevant: true,
          intent: 'high',
          tags: ['Asked Recommendation'],
          reason: 'r',
          replyDraft: 'reply',
        };
      }
      return { relevant: false, intent: 'low', tags: [], reason: '', replyDraft: null };
    });

    let matchesReads = 0;
    let matchesInserted = 0;
    supabase.from.mockImplementation((table: string) => {
      if (table === 'businesses') {
        return makeChain({ await: { data: [makeBusiness()], error: null } });
      }
      if (table === 'subreddits') {
        return makeChain({
          await: { data: [{ id: 's1', business_id: 'b1', name: 'SaaS' }], error: null },
        });
      }
      if (table === 'keywords') {
        return makeChain({
          await: { data: [{ id: 'k1', business_id: 'b1', term: 'crm' }], error: null },
        });
      }
      if (table === 'matches') {
        matchesReads += 1;
        if (matchesReads === 1) {
          return makeChain({
            await: { data: [{ reddit_post_id: 'p-existing' }], error: null },
          });
        }
        const chain = makeChain();
        chain.insert = vi.fn((row: unknown) => {
          matchesInserted += 1;
          const inserted = makeMatchRow({
            ...(row as object),
            id: `m${matchesInserted}`,
          });
          return makeChain({ single: { data: inserted, error: null } });
        });
        chain.update = vi.fn().mockReturnValue(makeChain());
        return chain;
      }
      if (table === 'users') {
        return makeChain({ single: { data: { email: 'u@example.com' }, error: null } });
      }
      return makeChain();
    });

    const count = await scanAllBusinesses();

    expect(fetchNewPosts).toHaveBeenCalledWith('SaaS');
    expect(searchSubreddit).toHaveBeenCalledWith('SaaS', 'crm');
    expect(scorePost).toHaveBeenCalledTimes(2);
    expect(scorePost.mock.calls.map((c) => (c[2] as RedditPost).id).sort()).toEqual([
      'p-irrelevant',
      'p-new',
    ]);
    expect(matchesInserted).toBe(1);
    expect(count).toBe(1);
  });

  it('does not call scorePost for posts already in matches', async () => {
    fetchNewPosts.mockResolvedValueOnce([makePost({ id: 'p-known' })]);

    let matchesQueryCount = 0;
    supabase.from.mockImplementation((table: string) => {
      if (table === 'businesses') {
        return makeChain({ await: { data: [makeBusiness()], error: null } });
      }
      if (table === 'subreddits') {
        return makeChain({
          await: { data: [{ id: 's1', business_id: 'b1', name: 'SaaS' }], error: null },
        });
      }
      if (table === 'keywords') {
        return makeChain({ await: { data: [], error: null } });
      }
      if (table === 'matches') {
        matchesQueryCount += 1;
        if (matchesQueryCount === 1) {
          return makeChain({
            await: {
              data: [{ reddit_post_id: 'p-known' }],
              error: null,
            },
          });
        }
        return makeChain();
      }
      return makeChain();
    });

    const count = await scanAllBusinesses();

    expect(count).toBe(0);
    expect(scorePost).not.toHaveBeenCalled();
  });

  it('sends an email and stamps notified_at when the digest sends successfully', async () => {
    fetchNewPosts.mockResolvedValueOnce([makePost({ id: 'p1' })]);
    scorePost.mockResolvedValue({
      relevant: true,
      intent: 'high',
      tags: [],
      reason: '',
      replyDraft: null,
    });
    sendDigestEmail.mockResolvedValue(true);

    let updateCalled = false;
    let updatePayload: unknown;
    supabase.from.mockImplementation((table: string) => {
      if (table === 'businesses') {
        return makeChain({ await: { data: [makeBusiness()], error: null } });
      }
      if (table === 'subreddits') {
        return makeChain({
          await: { data: [{ id: 's1', business_id: 'b1', name: 'SaaS' }], error: null },
        });
      }
      if (table === 'keywords') {
        return makeChain({ await: { data: [], error: null } });
      }
      if (table === 'matches') {
        const chain = makeChain();
        chain.insert = vi.fn(() =>
          makeChain({ single: { data: makeMatchRow(), error: null } }),
        );
        chain.update = vi.fn((payload: unknown) => {
          updateCalled = true;
          updatePayload = payload;
          return makeChain();
        });
        return chain;
      }
      if (table === 'users') {
        return makeChain({ single: { data: { email: 'u@example.com' }, error: null } });
      }
      return makeChain();
    });

    await scanAllBusinesses();

    expect(sendDigestEmail).toHaveBeenCalledTimes(1);
    expect(updateCalled).toBe(true);
    expect(updatePayload).toMatchObject({ notified_at: expect.any(String) });
  });

  it('does not stamp notified_at when the email send fails', async () => {
    fetchNewPosts.mockResolvedValueOnce([makePost({ id: 'p1' })]);
    scorePost.mockResolvedValue({
      relevant: true,
      intent: 'high',
      tags: [],
      reason: '',
      replyDraft: null,
    });
    sendDigestEmail.mockResolvedValue(false);

    let updateCalled = false;
    supabase.from.mockImplementation((table: string) => {
      if (table === 'businesses') {
        return makeChain({ await: { data: [makeBusiness()], error: null } });
      }
      if (table === 'subreddits') {
        return makeChain({
          await: { data: [{ id: 's1', business_id: 'b1', name: 'SaaS' }], error: null },
        });
      }
      if (table === 'keywords') {
        return makeChain({ await: { data: [], error: null } });
      }
      if (table === 'matches') {
        const chain = makeChain();
        chain.insert = vi.fn(() =>
          makeChain({ single: { data: makeMatchRow(), error: null } }),
        );
        chain.update = vi.fn(() => {
          updateCalled = true;
          return makeChain();
        });
        return chain;
      }
      if (table === 'users') {
        return makeChain({ single: { data: { email: 'u@example.com' }, error: null } });
      }
      return makeChain();
    });

    await scanAllBusinesses();

    expect(sendDigestEmail).toHaveBeenCalledTimes(1);
    expect(updateCalled).toBe(false);
  });

  it('skips notify when the business owner email is missing', async () => {
    fetchNewPosts.mockResolvedValueOnce([makePost({ id: 'p1' })]);
    scorePost.mockResolvedValue({
      relevant: true,
      intent: 'high',
      tags: [],
      reason: '',
      replyDraft: null,
    });

    supabase.from.mockImplementation((table: string) => {
      if (table === 'businesses') {
        return makeChain({ await: { data: [makeBusiness()], error: null } });
      }
      if (table === 'subreddits') {
        return makeChain({
          await: { data: [{ id: 's1', business_id: 'b1', name: 'SaaS' }], error: null },
        });
      }
      if (table === 'keywords') {
        return makeChain({ await: { data: [], error: null } });
      }
      if (table === 'matches') {
        const chain = makeChain();
        chain.insert = vi.fn(() =>
          makeChain({ single: { data: makeMatchRow(), error: null } }),
        );
        return chain;
      }
      if (table === 'users') {
        return makeChain({ single: { data: null, error: null } });
      }
      return makeChain();
    });

    await scanAllBusinesses();

    expect(sendDigestEmail).not.toHaveBeenCalled();
  });

  it('warns and continues when fetchNewPosts throws for a subreddit', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    fetchNewPosts.mockRejectedValueOnce(new Error('rate limited'));
    searchSubreddit.mockResolvedValue([makePost({ id: 'p1' })]);
    scorePost.mockResolvedValue({
      relevant: true,
      intent: 'medium',
      tags: [],
      reason: '',
      replyDraft: null,
    });

    supabase.from.mockImplementation((table: string) => {
      if (table === 'businesses') {
        return makeChain({ await: { data: [makeBusiness()], error: null } });
      }
      if (table === 'subreddits') {
        return makeChain({
          await: { data: [{ id: 's1', business_id: 'b1', name: 'SaaS' }], error: null },
        });
      }
      if (table === 'keywords') {
        return makeChain({
          await: { data: [{ id: 'k1', business_id: 'b1', term: 'crm' }], error: null },
        });
      }
      if (table === 'matches') {
        const chain = makeChain();
        chain.insert = vi.fn(() =>
          makeChain({ single: { data: makeMatchRow(), error: null } }),
        );
        return chain;
      }
      if (table === 'users') {
        return makeChain({ single: { data: { email: 'u@example.com' }, error: null } });
      }
      return makeChain();
    });

    const count = await scanAllBusinesses();

    expect(warnSpy).toHaveBeenCalledWith('[scan] r/SaaS failed:', 'rate limited');
    expect(count).toBe(0);

    warnSpy.mockRestore();
  });

  it('truncates the post body to 4000 chars before insert', async () => {
    const longBody = 'x'.repeat(5000);
    fetchNewPosts.mockResolvedValueOnce([makePost({ id: 'p1', selftext: longBody })]);
    scorePost.mockResolvedValue({
      relevant: true,
      intent: 'low',
      tags: [],
      reason: '',
      replyDraft: null,
    });

    let insertPayload: unknown;
    supabase.from.mockImplementation((table: string) => {
      if (table === 'businesses') {
        return makeChain({ await: { data: [makeBusiness()], error: null } });
      }
      if (table === 'subreddits') {
        return makeChain({
          await: { data: [{ id: 's1', business_id: 'b1', name: 'SaaS' }], error: null },
        });
      }
      if (table === 'keywords') {
        return makeChain({ await: { data: [], error: null } });
      }
      if (table === 'matches') {
        const chain = makeChain();
        chain.insert = vi.fn((row: unknown) => {
          insertPayload = row;
          return makeChain({ single: { data: makeMatchRow(), error: null } });
        });
        return chain;
      }
      if (table === 'users') {
        return makeChain({ single: { data: null, error: null } });
      }
      return makeChain();
    });

    await scanAllBusinesses();

    expect((insertPayload as { body: string }).body.length).toBe(4000);
  });
});
