# HTTP API

Base URL: `http://localhost:4000` in dev (configurable; the frontend uses `VITE_API_URL`). All
request/response bodies are JSON. CORS is restricted to `config.corsOrigin` (default
`http://localhost:5173`).

## `GET /health`
Liveness probe.
- **200** → `{ "ok": true }`

---

## `POST /api/onboarding`
Captures the user, runs LLM discovery, and persists the business with its suggested subreddits and
keywords.

**Request body** (validated with Zod):
| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `email` | string (email) | yes | user identity; upserted into `users` |
| `name` | string (min 1) | yes | business name |
| `websiteUrl` | string (url) | no | scraped for discovery if present |
| `theme` | string | no | what the business does |
| `problemsSolved` | string | no | |
| `competitors` | string[] | no | included as keywords |

Additional rule: at least one of `websiteUrl` or `theme` must be provided.

**Responses**
- **201** →
  ```json
  {
    "business": { "id": "…", "user_id": "…", "name": "…", "website_url": null,
                  "theme": "…", "problems_solved": "…", "competitors": [],
                  "profile": { "valueProposition": "…", "audience": "…", "painsSolved": ["…"] },
                  "created_at": "…" },
    "discovery": { "profile": { … }, "subreddits": ["SaaS", "startups"], "keywords": ["…"] }
  }
  ```
- **400** → `{ "error": <zod flatten> }` (validation) or `{ "error": "Provide a websiteUrl or a theme" }`
- **500** → `{ "error": "<message>" }` (user upsert / discovery / persistence failure)

---

## `GET /api/businesses?email=<email>`
Lists a user's businesses, newest first.

- **400** → `{ "error": "email query param is required" }` if `email` is missing.
- **200** → `{ "businesses": Business[] }`. Returns `{ "businesses": [] }` if the email is unknown.
- **500** → `{ "error": "<message>" }`

---

## `POST /api/businesses/scan`
Manually triggers a scan across **all** businesses (same code path as the `npm run scan` CLI). Also
suitable for a scheduler/webhook.

- **200** → `{ "newMatches": <number> }`
- **500** → `{ "error": "<message>" }`

> Note: this is a synchronous, potentially long-running call (it polls Reddit and calls the LLM per
> candidate post). For production, prefer running it from a scheduler rather than a user request.

---

## `GET /api/matches?businessId=<id>`
Lists a business's matches, **newest first** (`order by created_utc desc`), capped at 200.

- **400** → `{ "error": "businessId query param is required" }`
- **200** → `{ "matches": Match[] }`
- **500** → `{ "error": "<message>" }`

Each `Match` includes `title`, `subreddit`, `author`, `permalink`, `created_utc`, `intent`, `tags`,
`reply_draft`, `reason` (see [data-model.md](data-model.md)).

## Error convention
Non-2xx responses carry a JSON `error` field. The frontend `request()` helper surfaces that field's
message directly to the UI.
