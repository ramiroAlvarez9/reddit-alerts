import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase, discoverBusiness, fetchWebsiteText } = vi.hoisted(() => ({
  supabase: { from: vi.fn() },
  discoverBusiness: vi.fn(),
  fetchWebsiteText: vi.fn(),
}));

vi.mock('../db.js', () => ({ supabase }));
vi.mock('../llm/discovery.js', () => ({ discoverBusiness }));
vi.mock('../util/website.js', () => ({ fetchWebsiteText }));

import { onboardBusiness } from './onboarding.js';
import { makeChain } from '../test/supabase-mock.js';

describe('onboardBusiness', () => {
  beforeEach(() => {
    supabase.from.mockReset();
    discoverBusiness.mockReset();
    fetchWebsiteText.mockReset();
  });

  it('runs discovery, inserts business + subreddits + keywords, and returns both', async () => {
    fetchWebsiteText.mockResolvedValue('homepage text');
    discoverBusiness.mockResolvedValue({
      profile: { valueProposition: 'vp', audience: 'a', painsSolved: ['p1'] },
      subreddits: ['SaaS', 'startups'],
      keywords: ['alpha', 'beta'],
    });

    const businessRow = {
      id: 'b1',
      user_id: 'u1',
      name: 'Acme',
      website_url: 'https://acme.com',
      theme: 'reddit alerts',
      problems_solved: 'manual scanning',
      competitors: ['F5Bot'],
      profile: { valueProposition: 'vp', audience: 'a', painsSolved: ['p1'] },
      created_at: '2025-01-01T00:00:00Z',
    };

    supabase.from.mockImplementation((table: string) => {
      if (table === 'businesses') {
        return makeChain({ single: { data: businessRow, error: null } });
      }
      return makeChain();
    });

    const result = await onboardBusiness({
      userId: 'u1',
      name: 'Acme',
      websiteUrl: 'https://acme.com',
      theme: 'reddit alerts',
      problemsSolved: 'manual scanning',
      competitors: ['F5Bot'],
    });

    expect(fetchWebsiteText).toHaveBeenCalledWith('https://acme.com');
    expect(discoverBusiness).toHaveBeenCalledWith({
      websiteText: 'homepage text',
      theme: 'reddit alerts',
      problemsSolved: 'manual scanning',
      competitors: ['F5Bot'],
    });

    expect(supabase.from).toHaveBeenCalledWith('businesses');
    expect(supabase.from).toHaveBeenCalledWith('subreddits');
    expect(supabase.from).toHaveBeenCalledWith('keywords');

    const businessChain = supabase.from.mock.results[0]!.value as ReturnType<typeof makeChain>;
    expect(businessChain.insert).toHaveBeenCalledWith({
      user_id: 'u1',
      name: 'Acme',
      website_url: 'https://acme.com',
      theme: 'reddit alerts',
      problems_solved: 'manual scanning',
      competitors: ['F5Bot'],
      profile: { valueProposition: 'vp', audience: 'a', painsSolved: ['p1'] },
    });

    const subsChain = supabase.from.mock.results[1]!.value as ReturnType<typeof makeChain>;
    expect(subsChain.insert).toHaveBeenCalledWith([
      { business_id: 'b1', name: 'SaaS' },
      { business_id: 'b1', name: 'startups' },
    ]);

    const kwsChain = supabase.from.mock.results[2]!.value as ReturnType<typeof makeChain>;
    expect(kwsChain.insert).toHaveBeenCalledWith([
      { business_id: 'b1', term: 'alpha' },
      { business_id: 'b1', term: 'beta' },
    ]);

    expect(result.business).toEqual(businessRow);
    expect(result.discovery.subreddits).toEqual(['SaaS', 'startups']);
  });

  it('proceeds without website text when websiteUrl is missing', async () => {
    discoverBusiness.mockResolvedValue({
      profile: { valueProposition: '', audience: '', painsSolved: [] },
      subreddits: [],
      keywords: [],
    });

    const businessRow = {
      id: 'b2',
      user_id: 'u1',
      name: 'Acme',
      website_url: null,
      theme: 't',
      problems_solved: '',
      competitors: [],
      profile: { valueProposition: '', audience: '', painsSolved: [] },
      created_at: '2025-01-01T00:00:00Z',
    };

    supabase.from.mockImplementation((table: string) => {
      if (table === 'businesses') return makeChain({ single: { data: businessRow, error: null } });
      return makeChain();
    });

    await onboardBusiness({ userId: 'u1', name: 'Acme', theme: 't' });

    expect(fetchWebsiteText).not.toHaveBeenCalled();
    expect(discoverBusiness).toHaveBeenCalledWith({
      theme: 't',
      problemsSolved: undefined,
      competitors: undefined,
    });
  });

  it('warns and continues when fetching the website fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchWebsiteText.mockRejectedValue(new Error('timeout'));
    discoverBusiness.mockResolvedValue({
      profile: { valueProposition: '', audience: '', painsSolved: [] },
      subreddits: [],
      keywords: [],
    });

    const businessRow = {
      id: 'b3',
      user_id: 'u1',
      name: 'Acme',
      website_url: 'https://acme.com',
      theme: 't',
      problems_solved: '',
      competitors: [],
      profile: { valueProposition: '', audience: '', painsSolved: [] },
      created_at: '2025-01-01T00:00:00Z',
    };

    supabase.from.mockImplementation((table: string) => {
      if (table === 'businesses') return makeChain({ single: { data: businessRow, error: null } });
      return makeChain();
    });

    const result = await onboardBusiness({
      userId: 'u1',
      name: 'Acme',
      websiteUrl: 'https://acme.com',
      theme: 't',
    });

    expect(warnSpy).toHaveBeenCalledWith('[onboarding] could not fetch website:', 'timeout');
    expect(discoverBusiness).toHaveBeenCalledWith({
      websiteText: undefined,
      theme: 't',
      problemsSolved: undefined,
      competitors: undefined,
    });
    expect(result.business.id).toBe('b3');

    warnSpy.mockRestore();
  });

  it('throws when the business insert fails', async () => {
    discoverBusiness.mockResolvedValue({
      profile: { valueProposition: '', audience: '', painsSolved: [] },
      subreddits: [],
      keywords: [],
    });

    supabase.from.mockImplementation(() =>
      makeChain({ single: { data: null, error: { message: 'db down' } } }),
    );

    await expect(
      onboardBusiness({ userId: 'u1', name: 'Acme', theme: 't' }),
    ).rejects.toThrow('Failed to create business: db down');
  });

  it('does not insert subreddits or keywords when discovery returned none', async () => {
    discoverBusiness.mockResolvedValue({
      profile: { valueProposition: '', audience: '', painsSolved: [] },
      subreddits: [],
      keywords: [],
    });

    const businessRow = {
      id: 'b4',
      user_id: 'u1',
      name: 'Acme',
      website_url: null,
      theme: 't',
      problems_solved: '',
      competitors: [],
      profile: { valueProposition: '', audience: '', painsSolved: [] },
      created_at: '2025-01-01T00:00:00Z',
    };

    supabase.from.mockImplementation((table: string) => {
      if (table === 'businesses') return makeChain({ single: { data: businessRow, error: null } });
      return makeChain();
    });

    await onboardBusiness({ userId: 'u1', name: 'Acme', theme: 't' });

    expect(supabase.from).toHaveBeenCalledWith('businesses');
    expect(supabase.from).not.toHaveBeenCalledWith('subreddits');
    expect(supabase.from).not.toHaveBeenCalledWith('keywords');
  });
});
