# reddit-alerts — Documentation

Technical documentation for the reddit-alerts platform: a Reddit social-listening / lead-generation
tool. A business describes what it does; an LLM derives the relevant subreddits and keywords; a scan
worker polls Reddit, scores posts by *intent*, stores the relevant ones, and emails the user. The
user replies manually — **the app never posts to Reddit**.

## Index
| Doc | What it covers |
| --- | --- |
| [architecture.md](architecture.md) | System overview, components, request/data flow, module map |
| [backend.md](backend.md) | Every backend module (config, Reddit client, LLM, services, routes) |
| [frontend.md](frontend.md) | React app: routing, pages, components, API client |
| [data-model.md](data-model.md) | Postgres/Supabase schema, tables, relationships, indexes |
| [api.md](api.md) | HTTP endpoints: request/response shapes and status codes |
| [configuration.md](configuration.md) | Environment variables (backend + frontend) |
| [plan.md](plan.md) | Original research, product plan, anti-spam guidance |
| [deploy.md](deploy.md) | Deployment guide (Vercel frontend + Node backend + Supabase) |

## TL;DR of the moving parts
- **Frontend** (`frontend/`) — React 18 + Vite + Tailwind SPA. Three routes: Landing, Onboarding,
  Dashboard. Talks to the backend over REST via a typed client (`src/lib/api.ts`).
- **Backend** (`backend/`) — Node 20 + Express + TypeScript. Exposes onboarding/businesses/matches
  routes and a scan worker. Uses an app-owned OpenAI-compatible LLM key (server-side only).
- **Database** (`supabase/schema.sql`) — Supabase/Postgres: `users`, `businesses`, `keywords`,
  `subreddits`, `matches`.
- **External services** — Reddit OAuth API (data), OpenAI-compatible LLM (discovery + scoring),
  Resend (email digests).

## Two core flows
1. **Onboarding / discovery** (synchronous, user-triggered): business info → optional website scrape
   → LLM derives profile + subreddits + keywords → validated against Reddit → persisted.
2. **Scan** (batch, scheduler-triggered): for each business, poll subreddits + keyword searches →
   dedupe → LLM scores each new post by intent → store relevant matches → email digest.
