# Architecture

## Overview
reddit-alerts is a two-tier web application plus a batch worker, backed by Supabase/Postgres and
three external APIs (Reddit, an OpenAI-compatible LLM, Resend). The design separates a **synchronous
onboarding/discovery** path from an **asynchronous scan** path so that the expensive Reddit + LLM
work during monitoring runs on a schedule rather than in the request cycle.

```
                         ┌──────────────────────────────────────────────┐
                         │                Frontend (SPA)                 │
                         │  React 18 + Vite + Tailwind + react-router     │
                         │  Landing → Onboarding → Dashboard              │
                         └───────────────┬───────────────────────────────┘
                                         │  REST (JSON), VITE_API_URL
                                         ▼
                         ┌──────────────────────────────────────────────┐
                         │             Backend (Express API)             │
                         │  /api/onboarding  /api/businesses  /api/matches│
                         │  services: onboarding, scan, email            │
                         │  llm: provider, discovery, scoring            │
                         │  reddit: OAuth client                         │
                         └───┬───────────────┬───────────────┬───────────┘
                             │               │               │
              service-role   │               │ OAuth         │ Bearer
                             ▼               ▼               ▼
                   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
                   │  Supabase /  │  │  Reddit API  │  │ LLM (OpenAI- │
                   │   Postgres   │  │  (oauth.     │  │  compatible) │
                   │              │  │  reddit.com) │  │              │
                   └──────────────┘  └──────────────┘  └──────────────┘
                             ▲
                             │ (scheduler: cron / GitHub Action / Supabase cron)
                   ┌─────────┴─────────┐
                   │  scan worker      │  backend/src/scripts/scan.ts → scanAllBusinesses()
                   │  (batch)          │  also reachable via POST /api/businesses/scan
                   └───────────────────┘   emails via Resend
```

## Components
### Frontend (`frontend/`)
A single-page React app. It holds **no secrets** — it only knows the backend base URL
(`VITE_API_URL`). Client-side routing (`react-router-dom`) with three routes. State is local
component state; the user's email is cached in `localStorage` (`reddit-alerts-email`). All server
communication goes through the typed client in `src/lib/api.ts`. See [frontend.md](frontend.md).

### Backend (`backend/`)
An Express server (`src/index.ts`) mounting three routers plus `/health`. Business logic lives in
`services/`; integrations live in `reddit/` and `llm/`. The single Supabase client
(`src/db.ts`) uses the **service-role key**, so the backend has full DB access and is the only tier
allowed to touch the database or the LLM key. See [backend.md](backend.md).

### Database (Supabase / Postgres)
Five tables (`users`, `businesses`, `keywords`, `subreddits`, `matches`) defined in
`supabase/schema.sql`. See [data-model.md](data-model.md).

### External services
- **Reddit API** — OAuth *client-credentials* (app type *script*). Used to search subreddits,
  fetch new posts, and keyword-search within a subreddit.
- **LLM** — any OpenAI-compatible chat-completions endpoint (default `gpt-4o-mini`). Used twice:
  discovery (business → profile/subreddits/keywords) and scoring (post → intent/tags/reply).
- **Resend** — transactional email for the digest notification. Optional: if `RESEND_API_KEY` is
  unset, email is skipped (no-op) and the rest of the pipeline still runs.

## Flow 1 — Onboarding / discovery (synchronous)
Triggered by `POST /api/onboarding`.
1. Route validates the body with Zod; requires `email` + `name`, and at least one of
   `websiteUrl` / `theme`.
2. Upsert the user by email (`users`), returning the user id.
3. `onboardBusiness()`:
   - if `websiteUrl` given, `fetchWebsiteText()` scrapes and strips the page to rough text
     (best-effort — failure is logged, not fatal);
   - `discoverBusiness()` sends website text + manual fields to the LLM (`chatJson`) and gets back
     `valueProposition`, `audience`, `painsSolved`, candidate `subreddits`, and `keywords`;
   - each candidate subreddit is **validated** against Reddit (`searchSubreddits`) so only real
     communities survive; keywords are de-duplicated;
   - the business (with its derived `profile` JSON) is inserted, then its subreddits and keywords.
4. The response returns `{ business, discovery }`; the frontend shows the derived profile/subreddits.

## Flow 2 — Scan (batch)
Triggered by the CLI `npm run scan` (→ `scanAllBusinesses()`) or `POST /api/businesses/scan`.
For every business that has a `profile` and at least one subreddit:
1. **Collect candidates** (`collectCandidates`): for each subreddit, fetch newest posts and run up
   to 5 keyword searches; collect into a `Map` keyed by Reddit post id (dedupe within the run).
2. **Skip known posts** (`loadExistingPostIds`): query `matches` for post ids already stored for
   this business (the `(business_id, reddit_post_id)` unique constraint is the durable dedupe).
3. **Score** each new post with the LLM (`scorePost`) → `{ relevant, intent, tags, reason,
   replyDraft }`. Irrelevant posts are dropped.
4. **Store** relevant posts as `matches`.
5. **Notify** (`notify` → `sendDigestEmail`): if there are new matches, email the business owner a
   digest and stamp `notified_at` so they are not re-notified.

## Key design decisions
- **No auto-posting.** The product only *notifies*; the human writes the actual Reddit comment. This
  sidesteps the biggest risk of this product category (Reddit flagging automated posting as spam).
- **Intent over keywords.** Keyword search is only a *candidate generator*; the LLM decides
  relevance by intent (asking for recommendations, complaining about a competitor, etc.).
- **App-owned LLM key.** A single generic key lives server-side (`LLM_API_KEY`); users never bring
  their own. `LLM_DAILY_CALL_LIMIT` is reserved for per-user usage caps (see Roadmap).
- **Provider-agnostic LLM.** `LLM_BASE_URL` lets the same code target OpenAI, Ollama, vLLM, etc.
- **Sync vs. batch split.** Discovery is interactive and cheap-ish; scanning is expensive and runs
  on a schedule, decoupled from user requests.

## Runtime / stack
- **Language:** TypeScript 5.6 across both tiers, ESM modules (`.js` import specifiers, `"type":
  "module"`), Node 20.
- **Backend:** Express 4, `@supabase/supabase-js`, `openai` SDK, `zod`, `dotenv`. Dev via `tsx
  watch`; build via `tsc`.
- **Frontend:** React 18, Vite 5, Tailwind CSS, `react-router-dom`.
- **Validation:** Zod at the onboarding route boundary; HTML5 `required` on the client form.

## Known gaps / roadmap
- No authentication yet — the dashboard identifies a user by typed email; `users` has no auth link.
- `LLM_DAILY_CALL_LIMIT` is configured but not yet enforced per user.
- Reddit rate limiting is minimal (token cached; no explicit backoff/throttle).
- No automated scheduler is committed — wire the scan CLI to cron / GitHub Actions / Supabase cron.
