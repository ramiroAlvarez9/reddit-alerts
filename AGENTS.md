# AGENTS.md

Compact guide for working in `reddit-alerts`. Repo: Reddit lead-monitoring SaaS
that finds relevant posts via LLM and emails them — no auto-posting.

## Layout

- `backend/` — Node 20+ / TypeScript / Express. API + scan worker + LLM + Reddit + Resend.
- `frontend/` — React 18 + Vite + Tailwind + react-router v6. Landing, Onboarding, Dashboard.
- `supabase/schema.sql` — manual Postgres schema (run in Supabase SQL editor; no CLI/migrations tool).
- `docs/plan.md` — research + architecture (in Spanish; read for product context).

Two-package monorepo with **separate lockfiles** (`pnpm-lock.yaml` each) — no
root `package.json` or workspaces. Run scripts inside `backend/` or `frontend/`.
**Use `pnpm`**, not `npm`. (Lockfile is `pnpm-lock.yaml`; no `package-lock.json`.)

## Dev commands

Both packages have the same set: `dev`, `build`, `typecheck`, `lint`, `test`,
`test:watch`. Tests run with **Vitest** (`pnpm test` is `vitest run`).

Backend (`backend/`):
- `pnpm dev` — `tsx watch src/index.ts` (API on `:4000`, CORS origin default `http://localhost:5173`).
- `pnpm scan` — one-shot worker (`tsx src/scripts/scan.ts`). Same logic as
  `POST /api/businesses/scan`. Wire this into cron / GitHub Actions.
- `pnpm build` → `dist/`, `pnpm start` runs `node dist/index.js`.

Frontend (`frontend/`):
- `pnpm dev` — Vite on `:5173`. Reads `VITE_API_URL` (default `http://localhost:4000`).
- `pnpm build` — `tsc -b && vite build` (TS project references: `tsconfig.app.json` + `tsconfig.node.json`).
- `pnpm test` uses `jsdom` env (see `vitest.config.ts`); component tests use
  `@testing-library/react` + `@testing-library/jest-dom`.

Lint/typecheck/test both packages after edits. Both configs error on
`@typescript-eslint/no-explicit-any`.

## Setup gotchas

- Backend is **ESM** (`"type": "module"`) and uses NodeNext-style imports
  (`import './foo.js'` with `.js` extensions). Keep the `.js` suffix on relative
  imports when adding files.
- Env loads via `import 'dotenv/config'` in `backend/src/config.ts` — no need
  for `dotenv -e`. Required: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `LLM_API_KEY`. Optional but
  expected: `RESEND_API_KEY` (email silently no-ops without it — matches still
  save, but `notified_at` stays null), `LLM_BASE_URL` (point at any
  OpenAI-compatible runner: Ollama, vLLM, …), `LLM_DAILY_CALL_LIMIT`.
- Reddit auth is OAuth2 **client_credentials** with a "script" app from
  https://www.reddit.com/prefs/apps. The OAuth token is cached in-memory in
  `backend/src/reddit/client.ts`; forking the worker splits the cache — use
  the single `pnpm scan` entrypoint when scheduling.
- Backend talks to Supabase with the **service role key** (bypasses RLS) and
  never exposes it. There is no real auth: users are identified by email
  passed in the query string (e.g. `GET /api/businesses?email=…`).
- The shared `LLM_API_KEY` is server-side only; **never** read it from the
  frontend or add a Vite env var for it.
- Schema lives at `supabase/schema.sql` (tables: `users`, `businesses`,
  `keywords`, `subreddits`, `matches` with `unique (business_id, reddit_post_id)`).
  No migrations framework — edit the SQL file directly.
- pnpm 11 needs `pnpm-workspace.yaml` (not the `pnpm` field in `package.json`)
  to allow native build scripts. Each package already has one approving
  `esbuild`. The old `pnpm.onlyBuiltDependencies` field is deprecated.

## Architecture pointers

- Onboarding flow: `POST /api/onboarding` → `services/onboarding.ts` fetches
  the website (best-effort, 15s timeout), then `llm/discovery.ts` derives
  profile + candidate subreddits (validated against the Reddit API) +
  keywords. Requires **either** `websiteUrl` **or** `theme` — server returns
  400 if both are missing.
- Scan flow: `services/scan.ts` polls `/r/{sub}/new` + keyword-restricted
  searches, dedupes by `reddit_post_id`, calls `llm/scoring.ts` per new post,
  inserts `matches`, then emails via Resend and stamps `notified_at`.
- LLM calls always go through `llm/provider.ts` (`chatJson`, JSON-mode,
  temperature 0.2). Scoring and discovery use different system prompts; the
  tag set is fixed in `scoring.ts` (`Asked Recommendation`,
  `Competition Complaint`, …).
- Frontend state: the user email is persisted in `localStorage` under
  `reddit-alerts-email` (see `Dashboard.tsx`). Brand colors are Tailwind
  tokens `brand` / `brand-dark` (purple, defined in `tailwind.config.js`).

## Testing

- Framework: **Vitest** in both packages. `pnpm test` runs once;
  `pnpm test:watch` for watch mode.
- Backend tests use the `node` environment. Routes are tested with
  **supertest** against a per-test Express app. Supabase and LLM clients are
  mocked with `vi.mock('.../db.js', …)`; the global `fetch` is mocked with
  `vi.spyOn(globalThis, 'fetch')`.
- Frontend tests use the `jsdom` environment (`vitest.config.ts`). React
  components render with `@testing-library/react`; matches/queries use
  `@testing-library/jest-dom`. `localStorage` and `fetch` are real
  (jsdom-provided); `react-router-dom`'s `useNavigate` is mocked per test
  with `vi.mock`.
- Test files live next to the code they test: `src/foo.test.ts` /
  `src/foo.test.tsx`. They are matched by Vitest's default `**/*.test.ts`
  pattern, so the production `tsc -b` build does not include them.
- There is no coverage gate; add one explicitly if needed.

## Conventions

- Strict TS in both packages (`noUnusedLocals`, `noUnusedParameters`,
  `noImplicitOverride` in backend; `noFallthroughCasesInSwitch` in frontend).
- ESLint: no-explicit-any is an error; unused vars in backend ignore `_` prefix.
- No CI, no pre-commit, no Docker, no opencode.json, no Cursor/Claude rules.
  Don't assume any of these exist.
