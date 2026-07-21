# Backend

Node 20 + Express + TypeScript (ESM). Entry point `src/index.ts`. Business logic in `services/`,
integrations in `reddit/` and `llm/`, shared types in `types.ts`.

## Directory map
```
backend/src/
├── index.ts            # Express app: CORS, JSON, /health, mounts routers, listens on PORT
├── config.ts           # Typed env config with required()/optional() helpers
├── db.ts               # Single Supabase client (service-role key)
├── types.ts            # Shared domain types
├── routes/
│   ├── onboarding.ts   # POST /api/onboarding
│   ├── businesses.ts   # GET /api/businesses, POST /api/businesses/scan
│   └── matches.ts      # GET /api/matches
├── services/
│   ├── onboarding.ts   # onboardBusiness(): discovery + persistence
│   ├── scan.ts         # scanAllBusinesses(): poll → score → store → notify
│   └── email.ts        # sendDigestEmail(): Resend digest (no-op if unconfigured)
├── llm/
│   ├── provider.ts     # chatJson(): OpenAI-compatible JSON chat wrapper
│   ├── discovery.ts    # discoverBusiness(): business → profile/subreddits/keywords
│   └── scoring.ts      # scorePost(): post → relevance/intent/tags/reply
├── reddit/
│   └── client.ts       # OAuth token + fetchNewPosts/searchSubreddit/searchSubreddits
├── util/
│   └── website.ts      # fetchWebsiteText(): fetch + strip HTML to text
└── scripts/
    └── scan.ts         # CLI one-shot scan entrypoint for a scheduler
```

## npm scripts (`backend/package.json`)
| Script | Command | Purpose |
| --- | --- | --- |
| `dev` | `tsx watch src/index.ts` | Run API with hot reload |
| `start` | `node dist/index.js` | Run compiled API (production) |
| `build` | `tsc -p tsconfig.json` | Compile TypeScript → `dist/` |
| `scan` | `tsx src/scripts/scan.ts` | One-shot scan (for cron/scheduler) |
| `typecheck` | `tsc -p tsconfig.json --noEmit` | Types only |
| `lint` | `eslint "src/**/*.ts"` | Lint |

## Modules

### `index.ts`
Creates the Express app, applies `cors({ origin: config.corsOrigin })` and `express.json()`, exposes
`GET /health` → `{ ok: true }`, mounts the three routers under `/api/*`, and listens on
`config.port` (default 4000).

### `config.ts`
Loads `.env` (via `dotenv/config`) and builds a single typed `config` object. `required(name)`
throws `Missing required environment variable: <name>` if a variable is absent — so **the backend
refuses to boot without Supabase, Reddit, and LLM credentials**. `optional(name, fallback)` returns
a default. Groups: `port`, `corsOrigin`, `supabase`, `reddit`, `llm`, `email`. See
[configuration.md](configuration.md).

### `db.ts`
Exports a single `supabase` client created with the **service-role key** and
`{ auth: { persistSession: false, autoRefreshToken: false } }` (server context, no session). This
key bypasses row-level security, so it must never reach the frontend.

### `types.ts`
Shared domain types. `Intent = 'high' | 'medium' | 'low'`. `BusinessProfile`
(`valueProposition`, `audience`, `painsSolved[]`). `Business`, `Keyword`, `Subreddit`, `Match`
(DB row shapes). `RedditPost` (normalized Reddit listing item). `DiscoveryResult`
(`profile`, `subreddits`, `keywords`). `ScoringResult`
(`relevant`, `intent`, `tags`, `reason`, `replyDraft`).

### `reddit/client.ts`
Wraps the Reddit OAuth API (`https://oauth.reddit.com`).
- `getAccessToken()` — client-credentials grant against `https://www.reddit.com/api/v1/access_token`
  using HTTP Basic (`clientId:clientSecret`). Token cached in-memory (`cachedToken`) and reused
  until 30s before expiry.
- `redditGet<T>(path)` — authenticated GET with the bearer token and `User-Agent`.
- `toPost(child)` — normalizes a listing child into a `RedditPost` (prefixes `permalink` with
  `https://www.reddit.com`).
- `fetchNewPosts(subreddit, limit=25)` — `/r/{sub}/new`.
- `searchSubreddit(subreddit, query, limit=25)` — `/r/{sub}/search` with `restrict_sr=1`,
  `sort=new`, `t=week`.
- `searchSubreddits(query, limit=10)` — `/subreddits/search`, returns display names (used to
  validate LLM-suggested subreddits).

### `llm/provider.ts`
`chatJson<T>(system, user)` — thin wrapper over the `openai` SDK's chat completions. Constructs the
client from `config.llm` (`apiKey`, optional `baseURL`). Calls with `temperature: 0.2` and
`response_format: { type: 'json_object' }`, then `JSON.parse`s the content into `T`. Throws on an
empty response. This is the single choke point for all LLM calls; swap `LLM_BASE_URL` to change
provider.

### `llm/discovery.ts`
`discoverBusiness(input: DiscoveryInput): Promise<DiscoveryResult>`.
- Builds a prompt from whatever is available: `websiteText` (truncated to 6000 chars), `theme`,
  `problemsSolved`, `competitors`.
- Calls `chatJson` with a system prompt instructing the model to return
  `{ valueProposition, audience, painsSolved, subreddits, keywords }` (subreddits without the `r/`
  prefix; include competitor names as keywords).
- `validateSubreddits()` strips any `r/` prefix, de-dupes case-insensitively, and keeps only names
  that `searchSubreddits` confirms exist (validation failures are swallowed so one bad name can't
  fail the whole flow).
- `dedupe()` trims/de-dupes keywords.

### `llm/scoring.ts`
`scorePost(profile, competitors, post): Promise<ScoringResult>`. System prompt asks the model to
judge by **intent** (not keyword overlap) and return `{ relevant, intent, tags, reason, replyDraft
}`. `replyDraft` must be value-first, in the user's voice, mention the product only with disclosure,
and never be spam. The result is sanitized: `intent` falls back to `'low'` unless it is exactly
`'high'`/`'medium'`; `tags` defaults to `[]`; `replyDraft` defaults to `null`. Post body truncated
to 3000 chars.

### `services/onboarding.ts`
`onboardBusiness(input: OnboardInput): Promise<OnboardResult>`. Orchestrates discovery + persistence
(see Flow 1 in [architecture.md](architecture.md)). Website scrape is best-effort. Inserts the
`business` (with the derived `profile` as JSON), then bulk-inserts `subreddits` and `keywords`.

### `services/scan.ts`
The monitoring worker.
- `scanAllBusinesses()` — loads all businesses, runs `scanBusiness` on each, returns the total count
  of new matches.
- `scanBusiness(business)` — skips businesses without a `profile`; loads their subreddits + keywords
  (in parallel); `collectCandidates` → `loadExistingPostIds` → score each unseen post → insert
  relevant ones → `notify`.
- `collectCandidates(subreddits, keywords)` — per subreddit: newest posts + up to 5 keyword
  searches, merged into a `Map` by post id; per-subreddit failures are logged and skipped.
- `loadExistingPostIds(businessId, ids)` — queries `matches` to avoid re-scoring/re-inserting.
- `notify(business, matches)` — looks up the owner email, sends a digest, and stamps `notified_at`
  on the emailed matches when the send succeeds.

### `services/email.ts`
`sendDigestEmail(to, matches): Promise<boolean>`. No-ops (returns `false`) if `RESEND_API_KEY` is
unset or there are no matches. Builds an HTML digest (title link, `r/sub · intent · tags`, plus an
anti-spam reminder) and POSTs to `https://api.resend.com/emails`. All user-provided strings are
`escapeHtml`-escaped. Returns `true` only on a 2xx from Resend.

### `util/website.ts`
`fetchWebsiteText(url)` — fetches with a 15s timeout (`AbortSignal.timeout`), then removes
`<script>`/`<style>`, strips tags and entity references, and collapses whitespace to produce a rough
plain-text extraction for the discovery prompt.

### `scripts/scan.ts`
CLI entrypoint: runs `scanAllBusinesses()`, logs the count, and `process.exit(0/1)`. Intended to be
invoked by a scheduler (cron, GitHub Actions, Supabase cron).

## Routes
See [api.md](api.md) for full request/response detail. In short: `routes/onboarding.ts` (Zod
validation + user upsert + `onboardBusiness`), `routes/businesses.ts` (list by email + trigger
scan), `routes/matches.ts` (list a business's matches newest-first, capped at 200).
