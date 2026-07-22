import { beforeEach, describe, expect, it, vi } from 'vitest';

const { chatJson } = vi.hoisted(() => ({ chatJson: vi.fn() }));

vi.mock('./provider.js', () => ({ chatJson }));

import { scorePost } from './scoring.js';
import type { BusinessProfile, RedditPost } from '../types.js';

const profile: BusinessProfile = {
  valueProposition: 'Find Reddit leads',
  audience: 'SaaS founders',
  painsSolved: ['scanning subs', 'writing replies'],
};

function makePost(overrides: Partial<RedditPost> = {}): RedditPost {
  return {
    id: 'p1',
    subreddit: 'SaaS',
    title: 'Best tool for X?',
    selftext: 'body',
    permalink: 'https://reddit.com/r/SaaS/comments/p1',
    url: 'https://reddit.com/r/SaaS/comments/p1',
    author: 'alice',
    created_utc: 1_700_000_000,
    ...overrides,
  };
}

describe('scorePost', () => {
  beforeEach(() => {
    chatJson.mockReset();
  });

  it('passes business profile, competitors, and the post to chatJson', async () => {
    chatJson.mockResolvedValue({
      relevant: true,
      intent: 'high',
      tags: ['Asked Recommendation'],
      reason: 'clear intent',
      replyDraft: 'try us',
    });

    await scorePost(profile, ['F5Bot'], makePost());

    expect(chatJson).toHaveBeenCalledTimes(1);
    const [system, user] = chatJson.mock.calls[0]!;
    expect(system).toContain('score Reddit posts');
    expect(user).toContain('Value proposition: Find Reddit leads');
    expect(user).toContain('Audience: SaaS founders');
    expect(user).toContain('Pains solved: scanning subs; writing replies');
    expect(user).toContain('Competitors: F5Bot');
    expect(user).toContain('Subreddit: r/SaaS');
    expect(user).toContain('Title: Best tool for X?');
    expect(user).toContain('Body: body');
  });

  it('returns a normalized result on a happy response', async () => {
    chatJson.mockResolvedValue({
      relevant: true,
      intent: 'medium',
      tags: ['Competition Complaint'],
      reason: 'mentions F5Bot negatively',
      replyDraft: 'reply',
    });

    const result = await scorePost(profile, ['F5Bot'], makePost());

    expect(result).toEqual({
      relevant: true,
      intent: 'medium',
      tags: ['Competition Complaint'],
      reason: 'mentions F5Bot negatively',
      replyDraft: 'reply',
    });
  });

  it('downgrades invalid intent values to low', async () => {
    chatJson.mockResolvedValue({
      relevant: true,
      intent: 'urgent',
      tags: [],
      reason: '',
      replyDraft: null,
    });

    const result = await scorePost(profile, [], makePost());

    expect(result.intent).toBe('low');
  });

  it('coerces a truthy non-boolean relevant to true', async () => {
    chatJson.mockResolvedValue({
      relevant: 'yes',
      intent: 'low',
      tags: [],
      reason: '',
      replyDraft: null,
    });

    const result = await scorePost(profile, [], makePost());

    expect(result.relevant).toBe(true);
  });

  it('defaults tags to [] when the LLM returns a non-array', async () => {
    chatJson.mockResolvedValue({
      relevant: true,
      intent: 'low',
      tags: 'Competition Complaint',
      reason: '',
      replyDraft: null,
    });

    const result = await scorePost(profile, [], makePost());

    expect(result.tags).toEqual([]);
  });

  it('defaults replyDraft to null when missing', async () => {
    chatJson.mockResolvedValue({
      relevant: true,
      intent: 'low',
      tags: [],
      reason: '',
    });

    const result = await scorePost(profile, [], makePost());

    expect(result.replyDraft).toBeNull();
  });

  it('truncates the post body to 3000 characters in the prompt', async () => {
    chatJson.mockResolvedValue({
      relevant: false,
      intent: 'low',
      tags: [],
      reason: '',
      replyDraft: null,
    });

    await scorePost(profile, [], makePost({ selftext: 'y'.repeat(5000) }));

    const userPrompt = chatJson.mock.calls[0]![1] as string;
    const bodySection = userPrompt.split('Body: ')[1]!;
    expect(bodySection.length).toBe(3000);
  });
});
