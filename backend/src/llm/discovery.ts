import { chatJson } from './provider.js';
import { searchSubreddits } from '../reddit/client.js';
import type { DiscoveryResult } from '../types.js';

export interface DiscoveryInput {
  websiteText?: string;
  theme?: string;
  problemsSolved?: string;
  competitors?: string[];
}

interface RawDiscovery {
  valueProposition: string;
  audience: string;
  painsSolved: string[];
  subreddits: string[];
  keywords: string[];
}

const SYSTEM = `You are a Reddit marketing analyst. Given information about a business,
you infer its value proposition, target audience, and the pains it solves, then propose
the most relevant subreddits and search keywords where potential customers discuss those
pains. Prefer active, on-topic subreddits. Include competitor names as keywords when given.
Respond ONLY with JSON matching this shape:
{
  "valueProposition": string,
  "audience": string,
  "painsSolved": string[],
  "subreddits": string[],   // subreddit names WITHOUT the "r/" prefix
  "keywords": string[]
}`;

/**
 * Analyzes the first business data (website text and/or manual description) and
 * proposes an initial profile, subreddits, and keywords. Suggested subreddits are
 * validated against Reddit so only real communities survive.
 */
export async function discoverBusiness(input: DiscoveryInput): Promise<DiscoveryResult> {
  const parts: string[] = [];
  if (input.websiteText) parts.push(`Website content:\n${input.websiteText.slice(0, 6000)}`);
  if (input.theme) parts.push(`Business theme: ${input.theme}`);
  if (input.problemsSolved) parts.push(`Problems solved: ${input.problemsSolved}`);
  if (input.competitors?.length) parts.push(`Competitors: ${input.competitors.join(', ')}`);

  const raw = await chatJson<RawDiscovery>(SYSTEM, parts.join('\n\n'));

  const validated = await validateSubreddits(raw.subreddits ?? []);

  return {
    profile: {
      valueProposition: raw.valueProposition ?? '',
      audience: raw.audience ?? '',
      painsSolved: raw.painsSolved ?? [],
    },
    subreddits: validated,
    keywords: dedupe(raw.keywords ?? []),
  };
}

async function validateSubreddits(candidates: string[]): Promise<string[]> {
  const seen = new Set<string>();
  const valid: string[] = [];
  for (const name of candidates) {
    const clean = name.replace(/^\/?r\//i, '').trim();
    if (!clean || seen.has(clean.toLowerCase())) continue;
    seen.add(clean.toLowerCase());
    try {
      const results = await searchSubreddits(clean, 5);
      const match = results.find((r) => r.toLowerCase() === clean.toLowerCase());
      if (match) valid.push(match);
    } catch {
      // Skip subreddits we cannot validate rather than failing the whole flow.
    }
  }
  return valid;
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items.map((i) => i.trim()).filter(Boolean)));
}
