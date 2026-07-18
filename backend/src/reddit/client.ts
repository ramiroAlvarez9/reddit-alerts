import { config } from '../config.js';
import type { RedditPost } from '../types.js';

const OAUTH_BASE = 'https://oauth.reddit.com';
const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }

  const basic = Buffer.from(
    `${config.reddit.clientId}:${config.reddit.clientSecret}`,
  ).toString('base64');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': config.reddit.userAgent,
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    throw new Error(`Reddit auth failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.token;
}

async function redditGet<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${OAUTH_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': config.reddit.userAgent,
    },
  });
  if (!res.ok) {
    throw new Error(`Reddit request failed: ${res.status} ${path}`);
  }
  return (await res.json()) as T;
}

interface ListingChild {
  data: {
    id: string;
    subreddit: string;
    title: string;
    selftext: string;
    permalink: string;
    url: string;
    author: string;
    created_utc: number;
  };
}

interface Listing {
  data: { children: ListingChild[] };
}

function toPost(child: ListingChild): RedditPost {
  const d = child.data;
  return {
    id: d.id,
    subreddit: d.subreddit,
    title: d.title,
    selftext: d.selftext ?? '',
    permalink: `https://www.reddit.com${d.permalink}`,
    url: d.url,
    author: d.author,
    created_utc: d.created_utc,
  };
}

/** Newest posts in a subreddit. */
export async function fetchNewPosts(subreddit: string, limit = 25): Promise<RedditPost[]> {
  const listing = await redditGet<Listing>(
    `/r/${encodeURIComponent(subreddit)}/new?limit=${limit}`,
  );
  return listing.data.children.map(toPost);
}

/** Keyword search restricted to a subreddit, sorted by newest. */
export async function searchSubreddit(
  subreddit: string,
  query: string,
  limit = 25,
): Promise<RedditPost[]> {
  const params = new URLSearchParams({
    q: query,
    restrict_sr: '1',
    sort: 'new',
    limit: String(limit),
    t: 'week',
  });
  const listing = await redditGet<Listing>(
    `/r/${encodeURIComponent(subreddit)}/search?${params.toString()}`,
  );
  return listing.data.children.map(toPost);
}

interface SubredditSearchChild {
  data: { display_name: string; subscribers: number | null };
}

/** Validate/discover subreddit names by topic query. */
export async function searchSubreddits(query: string, limit = 10): Promise<string[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const listing = await redditGet<{ data: { children: SubredditSearchChild[] } }>(
    `/subreddits/search?${params.toString()}`,
  );
  return listing.data.children.map((c) => c.data.display_name);
}
