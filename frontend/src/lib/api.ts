const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

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
  created_at: string;
}

export interface DiscoveryResult {
  profile: BusinessProfile;
  subreddits: string[];
  keywords: string[];
}

export interface OnboardPayload {
  email: string;
  name: string;
  websiteUrl?: string;
  theme?: string;
  problemsSolved?: string;
  competitors?: string[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ? JSON.stringify(body.error) : `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function onboard(
  payload: OnboardPayload,
): Promise<{ business: Business; discovery: DiscoveryResult }> {
  return request('/api/onboarding', { method: 'POST', body: JSON.stringify(payload) });
}

export function listBusinesses(email: string): Promise<{ businesses: Business[] }> {
  return request(`/api/businesses?email=${encodeURIComponent(email)}`);
}

export function listMatches(businessId: string): Promise<{ matches: Match[] }> {
  return request(`/api/matches?businessId=${encodeURIComponent(businessId)}`);
}
