import { supabase } from '../db.js';
import { discoverBusiness, type DiscoveryInput } from '../llm/discovery.js';
import { fetchWebsiteText } from '../util/website.js';
import type { Business, DiscoveryResult } from '../types.js';

export interface OnboardInput {
  userId: string;
  name: string;
  websiteUrl?: string;
  theme?: string;
  problemsSolved?: string;
  competitors?: string[];
}

export interface OnboardResult {
  business: Business;
  discovery: DiscoveryResult;
}

/**
 * Runs the LLM discovery over the first business data, then persists the business
 * together with its suggested subreddits and keywords.
 */
export async function onboardBusiness(input: OnboardInput): Promise<OnboardResult> {
  const discoveryInput: DiscoveryInput = {
    theme: input.theme,
    problemsSolved: input.problemsSolved,
    competitors: input.competitors,
  };

  if (input.websiteUrl) {
    try {
      discoveryInput.websiteText = await fetchWebsiteText(input.websiteUrl);
    } catch (err) {
      console.warn('[onboarding] could not fetch website:', (err as Error).message);
    }
  }

  const discovery = await discoverBusiness(discoveryInput);

  const { data: business, error } = await supabase
    .from('businesses')
    .insert({
      user_id: input.userId,
      name: input.name,
      website_url: input.websiteUrl ?? null,
      theme: input.theme ?? '',
      problems_solved: input.problemsSolved ?? '',
      competitors: input.competitors ?? [],
      profile: discovery.profile,
    })
    .select()
    .single<Business>();

  if (error || !business) {
    throw new Error(`Failed to create business: ${error?.message}`);
  }

  if (discovery.subreddits.length) {
    await supabase
      .from('subreddits')
      .insert(discovery.subreddits.map((name) => ({ business_id: business.id, name })));
  }
  if (discovery.keywords.length) {
    await supabase
      .from('keywords')
      .insert(discovery.keywords.map((term) => ({ business_id: business.id, term })));
  }

  return { business, discovery };
}
