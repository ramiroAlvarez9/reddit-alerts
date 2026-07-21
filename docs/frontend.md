# Frontend

React 18 + Vite 5 + Tailwind CSS SPA. TypeScript, `react-router-dom` for routing. The app holds no
secrets — it only knows the backend base URL via `VITE_API_URL`.

## Directory map
```
frontend/src/
├── main.tsx              # Bootstraps React, BrowserRouter + Routes
├── index.css             # Tailwind entry + base styles
├── vite-env.d.ts         # Vite client type reference (import.meta.env)
├── lib/
│   └── api.ts            # Typed REST client + shared types
├── pages/
│   ├── Landing.tsx       # "/"  marketing + URL capture
│   ├── Onboarding.tsx    # "/onboarding" business form + discovery result
│   └── Dashboard.tsx     # "/dashboard" lead feed
└── components/
    └── MatchCard.tsx     # Single lead card (intent, tags, reply draft)
```

## npm scripts (`frontend/package.json`)
| Script | Command | Purpose |
| --- | --- | --- |
| `dev` | `vite` | Dev server (http://localhost:5173) |
| `build` | `tsc -b && vite build` | Type-check project refs + production build → `dist/` |
| `preview` | `vite preview` | Serve the production build locally |
| `typecheck` | `tsc -b --noEmit` | Types only |
| `lint` | `eslint "src/**/*.{ts,tsx}"` | Lint |

## Routing (`main.tsx`)
`BrowserRouter` with three routes: `/` → `Landing`, `/onboarding` → `Onboarding`, `/dashboard` →
`Dashboard`. Rendered under `<StrictMode>`. Because it uses HTML5 history routing, a static host
must rewrite unknown paths to `index.html` (handled by `frontend/vercel.json` on Vercel).

## API client (`lib/api.ts`)
- `API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'`.
- `request<T>(path, init)` — `fetch` wrapper that sets JSON headers and throws the server's `error`
  field (or status text) on a non-OK response.
- Exported types mirror the backend: `Intent`, `BusinessProfile`, `Business`, `Match`,
  `DiscoveryResult`, `OnboardPayload`.
- Exported calls:
  - `onboard(payload) → { business, discovery }` — `POST /api/onboarding`.
  - `listBusinesses(email) → { businesses }` — `GET /api/businesses?email=`.
  - `listMatches(businessId) → { matches }` — `GET /api/matches?businessId=`.

> Note: the frontend `Match` type intentionally omits `notified_at` (a server-only field).

## Pages

### `Landing.tsx` (`/`)
Marketing hero ("Show up where your buyers are already talking on Reddit"), a single URL input, and
a **Find my first leads** button. On submit it does **not** call the API — it navigates to
`/onboarding` passing the URL via router state: `navigate('/onboarding', { state: { websiteUrl }})`.
A header **Dashboard** button routes to `/dashboard`.

### `Onboarding.tsx` (`/onboarding`)
The business setup form. Fields: Email (`required`), Business name (`required`), Website URL
(prefilled from `useLocation().state.websiteUrl`), Theme, Problems you solve, Competitors
(comma-separated). On submit it calls `onboard()`, caches the email in `localStorage`
(`reddit-alerts-email`), and on success swaps the form for a **result view** showing the derived
value proposition, audience, subreddit chips (`r/…`), and keyword chips, plus a **Go to dashboard**
button. Errors render a red inline message. `Field`/`Section` are small local presentational
helpers.

### `Dashboard.tsx` (`/dashboard`)
The lead feed. Email initializes from `localStorage`. On mount, if an email exists it calls
`loadBusinesses()`; the **Load** button re-fetches and persists the email. Businesses render as
selectable chips; selecting one (`activeId`) triggers `listMatches()`. Matches render as
`MatchCard`s. Empty state: *"No leads yet. Once a scan runs, relevant posts will show up here
newest-first."* Ordering is server-side (newest first). A **+ Add business** link routes back to
onboarding.

## Components

### `MatchCard.tsx`
Renders one `Match`: title linking to the Reddit `permalink` (opens in a new tab), `r/sub · u/author
· <local time>` (from `created_utc * 1000`), an intent badge color-coded via `INTENT_STYLES`
(green/yellow/gray for high/medium/low), tag chips, the LLM `reason`, a collapsible
`<details>` **Suggested reply (edit before posting)** block showing `reply_draft`, and a **Go
comment →** button linking to the post. The reply draft is deliberately gated behind a disclosure
and labeled "edit before posting" to reinforce the no-spam / human-in-the-loop stance.

## Configuration
Only `VITE_API_URL` (see [configuration.md](configuration.md)). Vite inlines `VITE_*` variables at
**build time**, so changing the backend URL requires a rebuild/redeploy.
