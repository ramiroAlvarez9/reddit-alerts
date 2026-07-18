import { supabase } from '../db.js';
import { fetchNewPosts, searchSubreddit } from '../reddit/client.js';
import { scorePost } from '../llm/scoring.js';
import { sendDigestEmail } from './email.js';
import type { Business, Keyword, Match, RedditPost, Subreddit } from '../types.js';

/** Scans every business for new relevant posts, scores them, stores and notifies. */
export async function scanAllBusinesses(): Promise<number> {
  const { data: businesses, error } = await supabase.from('businesses').select('*');
  if (error) throw new Error(`Failed to load businesses: ${error.message}`);

  let totalNew = 0;
  for (const business of (businesses ?? []) as Business[]) {
    totalNew += await scanBusiness(business);
  }
  return totalNew;
}

async function scanBusiness(business: Business): Promise<number> {
  if (!business.profile) return 0;

  const [{ data: subs }, { data: kws }] = await Promise.all([
    supabase.from('subreddits').select('*').eq('business_id', business.id),
    supabase.from('keywords').select('*').eq('business_id', business.id),
  ]);

  const subreddits = (subs ?? []) as Subreddit[];
  const keywords = (kws ?? []) as Keyword[];
  if (subreddits.length === 0) return 0;

  const candidates = await collectCandidates(subreddits, keywords);
  const existingIds = await loadExistingPostIds(business.id, candidates.map((p) => p.id));

  const newMatches: Match[] = [];
  for (const post of candidates) {
    if (existingIds.has(post.id)) continue;

    const score = await scorePost(business.profile, business.competitors, post);
    if (!score.relevant) continue;

    const { data: inserted } = await supabase
      .from('matches')
      .insert({
        business_id: business.id,
        reddit_post_id: post.id,
        subreddit: post.subreddit,
        title: post.title,
        body: post.selftext.slice(0, 4000),
        url: post.url,
        permalink: post.permalink,
        author: post.author,
        created_utc: post.created_utc,
        intent: score.intent,
        tags: score.tags,
        reply_draft: score.replyDraft,
        reason: score.reason,
      })
      .select()
      .single<Match>();

    if (inserted) newMatches.push(inserted);
    existingIds.add(post.id);
  }

  await notify(business, newMatches);
  return newMatches.length;
}

async function collectCandidates(
  subreddits: Subreddit[],
  keywords: Keyword[],
): Promise<RedditPost[]> {
  const byId = new Map<string, RedditPost>();
  for (const sub of subreddits) {
    try {
      for (const post of await fetchNewPosts(sub.name)) byId.set(post.id, post);
      for (const kw of keywords.slice(0, 5)) {
        for (const post of await searchSubreddit(sub.name, kw.term)) byId.set(post.id, post);
      }
    } catch (err) {
      console.warn(`[scan] r/${sub.name} failed:`, (err as Error).message);
    }
  }
  return Array.from(byId.values());
}

async function loadExistingPostIds(
  businessId: string,
  postIds: string[],
): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();
  const { data } = await supabase
    .from('matches')
    .select('reddit_post_id')
    .eq('business_id', businessId)
    .in('reddit_post_id', postIds);
  return new Set((data ?? []).map((r: { reddit_post_id: string }) => r.reddit_post_id));
}

async function notify(business: Business, matches: Match[]): Promise<void> {
  if (matches.length === 0) return;

  const { data: user } = await supabase
    .from('users')
    .select('email')
    .eq('id', business.user_id)
    .single<{ email: string }>();

  if (!user?.email) return;

  const sent = await sendDigestEmail(user.email, matches);
  if (sent) {
    await supabase
      .from('matches')
      .update({ notified_at: new Date().toISOString() })
      .in(
        'id',
        matches.map((m) => m.id),
      );
  }
}
