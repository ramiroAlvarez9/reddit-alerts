import { chatJson } from './provider.js';
import type { BusinessProfile, RedditPost, ScoringResult } from '../types.js';

const SYSTEM = `You score Reddit posts as potential marketing/lead-generation opportunities
for a specific business. Judge by INTENT, not just keyword overlap: is this someone with the
problem the business solves, asking for recommendations, or complaining about a competitor?

Return ONLY JSON:
{
  "relevant": boolean,
  "intent": "high" | "medium" | "low",
  "tags": string[],          // e.g. "Asked Recommendation", "Competition Complaint", "Competition Mentioned", "Very Relevant", "Recent"
  "reason": string,          // one sentence
  "replyDraft": string       // a genuine, value-first reply in the user's voice; mention the product only if it truly helps, with disclosure. No spam.
}`;

export async function scorePost(
  profile: BusinessProfile,
  competitors: string[],
  post: RedditPost,
): Promise<ScoringResult> {
  const user = `BUSINESS PROFILE
Value proposition: ${profile.valueProposition}
Audience: ${profile.audience}
Pains solved: ${profile.painsSolved.join('; ')}
Competitors: ${competitors.join(', ') || 'none provided'}

REDDIT POST
Subreddit: r/${post.subreddit}
Title: ${post.title}
Body: ${post.selftext.slice(0, 3000)}`;

  const raw = await chatJson<ScoringResult>(SYSTEM, user);
  return {
    relevant: Boolean(raw.relevant),
    intent: raw.intent === 'high' || raw.intent === 'medium' ? raw.intent : 'low',
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    reason: raw.reason ?? '',
    replyDraft: raw.replyDraft ?? null,
  };
}
