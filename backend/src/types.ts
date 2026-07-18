export type Intent = 'high' | 'medium' | 'low';

export interface BusinessProfile {
  valueProposition: string;
  audience: string;
  painsSolved: string[];
}

export interface Business {
  id: string;
  user_id: string;
  name: string;
  website_url: string | null;
  theme: string;
  problems_solved: string;
  competitors: string[];
  profile: BusinessProfile | null;
  created_at: string;
}

export interface Keyword {
  id: string;
  business_id: string;
  term: string;
}

export interface Subreddit {
  id: string;
  business_id: string;
  name: string;
}

export interface Match {
  id: string;
  business_id: string;
  reddit_post_id: string;
  subreddit: string;
  title: string;
  body: string;
  url: string;
  permalink: string;
  author: string;
  created_utc: number;
  intent: Intent;
  tags: string[];
  reply_draft: string | null;
  reason: string | null;
  notified_at: string | null;
  created_at: string;
}

export interface RedditPost {
  id: string;
  subreddit: string;
  title: string;
  selftext: string;
  permalink: string;
  url: string;
  author: string;
  created_utc: number;
}

export interface DiscoveryResult {
  profile: BusinessProfile;
  subreddits: string[];
  keywords: string[];
}

export interface ScoringResult {
  relevant: boolean;
  intent: Intent;
  tags: string[];
  reason: string;
  replyDraft: string | null;
}
