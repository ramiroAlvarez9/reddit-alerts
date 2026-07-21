# Deploying reddit-alerts

The repo is split into a **frontend** (static SPA — great fit for Vercel) and a **backend**
(Express API + scan worker — needs a Node server host, not Vercel static). Deploy them
separately.

## 1. Database — Supabase
1. Create a project at https://supabase.com.
2. In the SQL editor, run [`supabase/schema.sql`](../supabase/schema.sql).
3. From **Project Settings → API**, copy the **Project URL** and the **service_role** key
   (server-side only — never ship it to the frontend).

## 2. Frontend — Vercel
`frontend/vercel.json` configures the Vite framework preset + an SPA rewrite so client-side routes
like `/dashboard` don't 404.

Steps:
1. Push this repo to GitHub and import it at https://vercel.com/new.
2. **Set the project Root Directory to `frontend`** (Vercel → Project → Settings → General →
   Root Directory). Required because the app lives in a subfolder.
3. Framework preset is auto-detected as **Vite** (build `npm run build`, output `dist`).
4. Add an environment variable `VITE_API_URL` = the public URL of your deployed backend (step 3).
5. Deploy. Vercel gives you a `*.vercel.app` URL.

> `VITE_*` vars are baked in at build time, so after changing `VITE_API_URL` you must redeploy.

CLI alternative:
```bash
npm i -g vercel
cd frontend
vercel            # first run links/creates the project
vercel --prod
```

## 3. Backend — a Node host (Railway / Render / Fly)
Vercel serverless doesn't fit the long-running scan worker, so host the backend on a Node platform.
Example with **Railway**:
1. New project → Deploy from GitHub repo.
2. Set **Root Directory** to `backend`, build `npm install && npm run build`, start `npm start`.
3. Add environment variables from [`backend/.env.example`](../backend/.env.example) (see
   [configuration.md](configuration.md)), with `CORS_ORIGIN` = your Vercel URL.
4. Deploy and copy the public URL → put it in the frontend's `VITE_API_URL`.

### Scheduling the scan
The scan runs via `npm run scan` (one-shot). Wire it to a scheduler:
- Railway/Render **Cron Job** running `npm run scan` every N minutes, or
- a GitHub Action on a cron schedule that hits `POST /api/businesses/scan`, or
- a Supabase scheduled function calling the same endpoint.

## Checklist
- [ ] Supabase schema applied
- [ ] Reddit *script* app created (`REDDIT_CLIENT_ID`/`SECRET`)
- [ ] LLM key + (optional) Resend key
- [ ] Backend deployed, env vars set, `CORS_ORIGIN` = frontend URL
- [ ] Frontend deployed on Vercel with Root Directory `frontend` and `VITE_API_URL` set
- [ ] Scan scheduled
