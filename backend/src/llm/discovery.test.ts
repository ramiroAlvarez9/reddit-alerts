import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { chatJson, searchSubreddits } = vi.hoisted(() => ({
  chatJson: vi.fn(),
  searchSubreddits: vi.fn(),
}));

vi.mock('./provider.js', () => ({ chatJson }));
vi.mock('../reddit/client.js', () => ({ searchSubreddits }));

import { discoverBusiness } from './discovery.js';

describe('discoverBusiness', () => {
  beforeEach(() => {
    chatJson.mockReset();
    searchSubreddits.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('builds a user prompt from the input fields and returns validated discovery', async () => {
    chatJson.mockResolvedValue({
      valueProposition: 'Save time on Reddit lead gen',
      audience: 'Indie SaaS founders',
      painsSolved: ['finding leads', 'writing replies'],
      subreddits: ['SaaS', 'startups', 'IndieHackers'],
      keywords: ['reddit leads', 'reddit leads', 'cold outreach'],
    });
    searchSubreddits.mockImplementation(async (q: string) => [q, `${q}-related`]);

    const result = await discoverBusiness({
      websiteText: 'homepage copy',
      theme: 'reddit lead alerts',
      problemsSolved: 'manual prospecting',
      competitors: ['F5Bot', 'GummySearch'],
    });

    expect(chatJson).toHaveBeenCalledTimes(1);
    const [system, user] = chatJson.mock.calls[0]!;
    expect(system).toContain('Reddit marketing analyst');
    expect(user).toContain('Website content:');
    expect(user).toContain('homepage copy');
    expect(user).toContain('Business theme: reddit lead alerts');
    expect(user).toContain('Problems solved: manual prospecting');
    expect(user).toContain('Competitors: F5Bot, GummySearch');

    expect(searchSubreddits).toHaveBeenCalledTimes(3);
    expect(searchSubreddits).toHaveBeenCalledWith('SaaS', 5);
    expect(searchSubreddits).toHaveBeenCalledWith('startups', 5);
    expect(searchSubreddits).toHaveBeenCalledWith('IndieHackers', 5);

    expect(result.profile).toEqual({
      valueProposition: 'Save time on Reddit lead gen',
      audience: 'Indie SaaS founders',
      painsSolved: ['finding leads', 'writing replies'],
    });
    expect(result.subreddits).toEqual(['SaaS', 'startups', 'IndieHackers']);
    expect(result.keywords).toEqual(['reddit leads', 'cold outreach']);
  });

  it('validates subreddits against the Reddit API and only keeps matches', async () => {
    chatJson.mockResolvedValue({
      valueProposition: '',
      audience: '',
      painsSolved: [],
      subreddits: ['SaaS', 'NotARealSubreddit123', 'startups'],
      keywords: ['alpha', 'beta'],
    });
    searchSubreddits.mockImplementation(async (q: string) => {
      if (q === 'NotARealSubreddit123') return [];
      return [q];
    });

    const result = await discoverBusiness({ theme: 'x' });

    expect(result.subreddits).toEqual(['SaaS', 'startups']);
    expect(result.keywords).toEqual(['alpha', 'beta']);
  });

  it('skips subreddit names when validation throws', async () => {
    chatJson.mockResolvedValue({
      valueProposition: '',
      audience: '',
      painsSolved: [],
      subreddits: ['SaaS', 'broken'],
      keywords: ['alpha'],
    });
    searchSubreddits.mockImplementation(async (q: string) => {
      if (q === 'broken') throw new Error('rate limited');
      return [q];
    });

    const result = await discoverBusiness({ theme: 'x' });

    expect(result.subreddits).toEqual(['SaaS']);
  });

  it('strips r/ prefix and dedupes subreddit candidates case-insensitively', async () => {
    chatJson.mockResolvedValue({
      valueProposition: '',
      audience: '',
      painsSolved: [],
      subreddits: ['r/SaaS', 'saas', 'SaaS', '/r/Startups'],
      keywords: [],
    });
    searchSubreddits.mockImplementation(async (q: string) => [q]);

    const result = await discoverBusiness({ theme: 'x' });

    expect(searchSubreddits).toHaveBeenCalledTimes(2);
    expect(searchSubreddits).toHaveBeenCalledWith('SaaS', 5);
    expect(searchSubreddits).toHaveBeenCalledWith('Startups', 5);
    expect(result.subreddits).toEqual(['SaaS', 'Startups']);
  });

  it('handles missing LLM fields with safe defaults', async () => {
    chatJson.mockResolvedValue({});
    searchSubreddits.mockResolvedValue([]);

    const result = await discoverBusiness({ theme: 'x' });

    expect(result.profile).toEqual({
      valueProposition: '',
      audience: '',
      painsSolved: [],
    });
    expect(result.subreddits).toEqual([]);
    expect(result.keywords).toEqual([]);
  });

  it('truncates website text to 6000 characters in the user prompt', async () => {
    chatJson.mockResolvedValue({
      valueProposition: '',
      audience: '',
      painsSolved: [],
      subreddits: [],
      keywords: [],
    });
    const big = 'x'.repeat(10_000);

    await discoverBusiness({ websiteText: big });

    const userPrompt = chatJson.mock.calls[0]![1] as string;
    const websiteSection = userPrompt.split('Website content:\n')[1]!;
    expect(websiteSection.length).toBe(6000);
  });
});
