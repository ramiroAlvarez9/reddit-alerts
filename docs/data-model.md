# Data model

Postgres (Supabase). Full DDL in [`supabase/schema.sql`](../supabase/schema.sql). Run it once in the
Supabase SQL editor (or via the CLI) to provision the database. Requires the `pgcrypto` extension
(`gen_random_uuid()`).

## Entity relationships
```
users (1) ──< (N) businesses (1) ──< (N) keywords
                              (1) ──< (N) subreddits
                              (1) ──< (N) matches
```
All child tables reference their parent with `on delete cascade`.

## Tables

### `users`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | `gen_random_uuid()` |
| `email` | text | **unique, not null** — upserted on onboarding |
| `created_at` | timestamptz | `now()` |

Identifies a user solely by email (no auth provider yet).

### `businesses`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `user_id` | uuid FK → users(id) | cascade delete |
| `name` | text not null | |
| `website_url` | text | nullable |
| `theme` | text not null default `''` | |
| `problems_solved` | text not null default `''` | |
| `competitors` | text[] not null default `{}` | |
| `profile` | jsonb | LLM-derived `BusinessProfile` (`valueProposition`, `audience`, `painsSolved`) |
| `created_at` | timestamptz | `now()` |

`profile` is null until discovery completes; the scan worker skips businesses without a profile.

### `keywords`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `business_id` | uuid FK → businesses(id) | cascade delete |
| `term` | text not null | search term (may include competitor names) |

Indexed by `business_id` (`keywords_business_idx`).

### `subreddits`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `business_id` | uuid FK → businesses(id) | cascade delete |
| `name` | text not null | subreddit display name (no `r/` prefix), validated against Reddit |

Indexed by `business_id` (`subreddits_business_idx`).

### `matches`
The core output table: Reddit posts deemed relevant, enriched with LLM metadata.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `business_id` | uuid FK → businesses(id) | cascade delete |
| `reddit_post_id` | text not null | Reddit's post id (e.g. `t3_…` base id) |
| `subreddit` | text not null | |
| `title` | text not null | |
| `body` | text not null default `''` | truncated to ~4000 chars on insert |
| `url` | text not null | post's external/self url |
| `permalink` | text not null | absolute `https://www.reddit.com/...` link |
| `author` | text not null default `''` | |
| `created_utc` | double precision not null | Reddit epoch seconds — the sort key |
| `intent` | text not null default `'low'` | `high` / `medium` / `low` |
| `tags` | text[] not null default `{}` | e.g. `Asked Recommendation`, `Competition Complaint` |
| `reply_draft` | text | LLM-suggested reply (nullable) |
| `reason` | text | one-sentence relevance rationale (nullable) |
| `notified_at` | timestamptz | set once the digest email is sent (dedupe notifications) |
| `created_at` | timestamptz | `now()` |

**Constraints & indexes**
- `unique (business_id, reddit_post_id)` — the durable dedupe: a post is stored at most once per
  business.
- `matches_business_created_idx on (business_id, created_utc desc)` — powers the newest-first
  dashboard feed and the `GET /api/matches` ordering.

## Field lifecycle notes
- `intent`, `tags`, `reply_draft`, `reason` are populated by `scorePost()` at scan time.
- `notified_at` starts null; `notify()` stamps it after a successful Resend send so the same match
  is not emailed twice.
- `created_utc` is the Reddit post timestamp (not the row insert time); `created_at` is the DB
  insert time.
