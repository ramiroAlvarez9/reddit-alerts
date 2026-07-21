# Configuration

All backend configuration is environment-based, loaded and validated in
[`backend/src/config.ts`](../backend/src/config.ts). Variables marked **required** cause the process
to throw on startup if missing (`Missing required environment variable: <name>`). Template:
[`backend/.env.example`](../backend/.env.example).

## Backend (`backend/.env`)
| Variable | Required | Default | Used by | Purpose |
| --- | --- | --- | --- | --- |
| `PORT` | no | `4000` | `index.ts` | HTTP port |
| `CORS_ORIGIN` | no | `http://localhost:5173` | `index.ts` | Allowed browser origin |
| `SUPABASE_URL` | **yes** | — | `db.ts` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | — | `db.ts` | Service-role key (server-only; bypasses RLS) |
| `REDDIT_CLIENT_ID` | **yes** | — | `reddit/client.ts` | Reddit *script* app id |
| `REDDIT_CLIENT_SECRET` | **yes** | — | `reddit/client.ts` | Reddit app secret |
| `REDDIT_USER_AGENT` | no | `reddit-alerts/0.1` | `reddit/client.ts` | Reddit-required UA string |
| `LLM_API_KEY` | **yes** | — | `llm/provider.ts` | App-owned OpenAI-compatible key |
| `LLM_MODEL` | no | `gpt-4o-mini` | `llm/provider.ts` | Chat model |
| `LLM_BASE_URL` | no | (SDK default) | `llm/provider.ts` | Override for Ollama/vLLM/etc. |
| `LLM_DAILY_CALL_LIMIT` | no | `200` | `config.ts` | Reserved per-user cap (not yet enforced) |
| `RESEND_API_KEY` | no | (empty) | `services/email.ts` | Enables email; unset → email is skipped |
| `EMAIL_FROM` | no | `alerts@example.com` | `services/email.ts` | Digest sender address |

Notes:
- The three **required** groups (Supabase, Reddit, LLM) mean the backend cannot boot in a
  credential-less environment — intentional, to avoid silently running half-configured.
- Email is **optional**: without `RESEND_API_KEY`, `sendDigestEmail` no-ops and the scan still
  stores matches.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` or `LLM_API_KEY` to the frontend.

## Frontend (`frontend/.env`)
| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `VITE_API_URL` | no | `http://localhost:4000` | Backend base URL |

`VITE_*` variables are inlined at **build time** by Vite — after changing `VITE_API_URL` you must
rebuild/redeploy the frontend. Template: [`frontend/.env.example`](../frontend/.env.example).

## Obtaining credentials
- **Supabase** — create a project, run `supabase/schema.sql`, copy the Project URL and `service_role`
  key from Project Settings → API.
- **Reddit** — create an app of type *script* at https://www.reddit.com/prefs/apps to get the client
  id/secret; set a descriptive `REDDIT_USER_AGENT`.
- **LLM** — an OpenAI API key (or any OpenAI-compatible endpoint via `LLM_BASE_URL`).
- **Resend** — an API key from https://resend.com/api-keys and a verified sender domain for
  `EMAIL_FROM`.

See [deploy.md](deploy.md) for wiring these into hosting providers.
