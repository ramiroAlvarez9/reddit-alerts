# reddit-alerts

Monitor Reddit for conversations relevant to your business and get emailed the ones worth
answering — scored by intent, with a suggested reply — so you can add value manually. No
auto-posting, no bans.

Inspired by tools like ConvoHunter, F5Bot and GummySearch. See
[`docs/plan.md`](docs/plan.md) for the full research and implementation plan.

## How it works

1. **Onboard by URL / description** — an LLM (shared, app-owned key) analyzes your business and
   proposes the initial subreddits and keywords, validated against the Reddit API.
2. **Scan** — a worker polls those subreddits, and an LLM scores each new post by _intent_
   (high/medium/low) with tags like `Asked Recommendation` or `Competition Complaint`.
3. **Notify** — relevant posts are stored and emailed to you (newest first), with a
   value-first reply draft you edit before posting yourself.

## Structure

```
backend/    Node.js + TypeScript API + scan worker (Express, Supabase, OpenAI-compatible LLM, Reddit OAuth, Resend)
frontend/   React + TypeScript (Vite + Tailwind): landing, onboarding, dashboard feed
supabase/   Postgres schema
docs/       plan.md — research + architecture
```

## Setup

### 1. Database (Supabase)
Create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor.

### 2. Backend
```bash
cd backend
cp .env.example .env   # fill in Supabase, Reddit, LLM and Resend values
npm install
npm run dev            # http://localhost:4000
```
Create a Reddit **script** app at https://www.reddit.com/prefs/apps for `REDDIT_CLIENT_ID` /
`REDDIT_CLIENT_SECRET`. The `LLM_API_KEY` is a single app-owned key used server-side only.

Run a scan manually (or wire `npm run scan` into a cron / GitHub Action):
```bash
npm run scan
# or: curl -X POST http://localhost:4000/api/businesses/scan
```

### 3. Frontend
```bash
cd frontend
cp .env.example .env    # VITE_API_URL=http://localhost:4000
npm install
npm run dev             # http://localhost:5173
```

## Deploy
Frontend → Vercel (config in `frontend/vercel.json`), backend → a Node host (Railway/Render/Fly).
Full step-by-step in [`docs/deploy.md`](docs/deploy.md).

## Responsible use
This tool notifies you; it never posts on your behalf. When you comment: add value first,
disclose your affiliation, respect each subreddit's rules, and don't spam. See `docs/plan.md` §6.
