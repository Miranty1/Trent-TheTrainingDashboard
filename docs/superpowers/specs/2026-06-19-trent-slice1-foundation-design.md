# Trent — The Training Dashboard: Slice 1 (Foundation & Strava Connection)

## Context

`handoff.md` specifies a free, single-user fitness dashboard ("Trent") that pulls
Strava data (synced from a COROS Pace 4) and renders Premium-style trends, PBs, and
training-load analytics. It is a greenfield repo (only `handoff.md` + `.git` exist).

The full app is too large for one spec, so it is decomposed into ordered slices:

1. **Foundation & Strava connection** ← this spec
2. Data schema & sync engine (3 sync modes, rate-limit handling, Training Load parsing, best_efforts)
3. Core dashboard (Overview + Activity detail + full Settings)
4. Trends & analytics (PBs, distance-over-time, zone distributions, ATL/CTL/Form, heatmap)
5. Gym log

This spec covers **Slice 1 only**: stand up the app + auth + a working, refreshing
Strava connection. End state: *"I can log in on laptop or iPhone and connect my
Strava account; tokens live server-side in Supabase and auto-refresh."*

### Decisions locked during brainstorming
- **OAuth redirect:** Edge Function callback + signed `state` nonce (one registered Strava
  app/domain works for both localhost and Vercel prod).
- **Auth lockdown:** disable public signups in Supabase, pre-provision the single user.
- **Token refresh:** lazy — a shared `getValidStravaToken(user)` helper refreshes only
  when `expires_at` is near, reused by all future server calls.

## Tech stack
- React + Vite, `react-router`, `vite-plugin-pwa` (installable PWA)
- Chart.js installed but unused until later slices
- Supabase: Postgres, Auth (magic link), Edge Functions (Deno)
- Vercel: frontend hosting

## Architecture

### Repo layout (single repo)
- `src/` — Vite React app
- `supabase/functions/` — Edge Functions (`strava-oauth-start`, `strava-oauth-callback`, `strava-athlete`, shared `_shared/strava.ts`)
- `supabase/migrations/` — SQL for tables + RLS

### Auth
- Magic link; public signups disabled, single user pre-provisioned (Supabase dashboard).
- Login page (email → magic link), session persisted by supabase-js, protected routes redirect to `/login`.

### Strava OAuth flow
- **`strava-oauth-start`** (authed): verifies caller's Supabase JWT → user_id; inserts a
  short-lived `oauth_state` row (`nonce`, `user_id`, `frontend_origin`, `expires_at`);
  returns the Strava authorize URL (`redirect_uri` = `strava-oauth-callback`,
  `state` = nonce, `scope` = `read,activity:read_all`).
- **`strava-oauth-callback`** (public — the one registered Strava callback domain):
  validates + consumes nonce → user_id + origin; POSTs `code` to Strava token endpoint;
  upserts `strava_tokens`; 302-redirects to `<frontend_origin>/settings?strava=connected`.
- **`strava-athlete`** (authed): calls Strava `/athlete` via `getValidStravaToken`; returns
  profile JSON for the Settings status display (also the acceptance demo for refresh).

### Data model (migrations)
- `strava_tokens`: `user_id` (PK, FK `auth.users`), `access_token`, `refresh_token`,
  `expires_at` (timestamptz), `athlete_id` (bigint), `scope` (text), `updated_at`.
  RLS: owner + service role only.
- `oauth_state`: `nonce` (PK, text), `user_id`, `frontend_origin`, `expires_at`.
  Written/read by Edge Functions via service role; not client-readable.

### Shared helper `_shared/strava.ts`
- `getValidStravaToken(supabaseAdmin, userId)`: read `strava_tokens`; if `expires_at`
  within a buffer (e.g. 60s), POST refresh to Strava, update row, return fresh access token.

### Frontend
- Routes: `/login`, `/` (Overview stub), `/activity/:id` (stub), `/trends` (stub),
  `/gym` (stub), `/settings`. Auth-guarded nav bar, responsive (laptop + iPhone Safari).
- Settings page: Strava status ("Connected as `<name>` `<avatar>`" / "Not connected") +
  Connect / Reconnect button (calls `strava-oauth-start`, redirects to returned URL).
- PWA: manifest `name` "Trent — The Training Dashboard", `short_name` "Trent"; service
  worker via `vite-plugin-pwa`. Page `<title>` = "Trent".

### Secrets / config
- Edge Function secrets: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`.
- Frontend env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

## Implementation steps

1. **Scaffold** Vite React app at root; set name "Trent — The Training Dashboard" in `package.json`, `index.html` title, README. Add `react-router`, `chart.js`, `@supabase/supabase-js`, `vite-plugin-pwa`.
2. **PWA manifest** (name/short_name "Trent") + service worker via `vite-plugin-pwa`.
3. **Supabase project**: init `supabase/`; migrations for `strava_tokens` + `oauth_state` with RLS. Disable public signups; pre-provision the single user.
4. **Frontend auth**: supabase client, magic-link login page, session context, protected route wrapper, app shell + nav with stub routes.
5. **Edge Functions**: `_shared/strava.ts` (`getValidStravaToken`), `strava-oauth-start`, `strava-oauth-callback`, `strava-athlete`. Set function secrets.
6. **Settings page**: connection status via `strava-athlete`; Connect/Reconnect via `strava-oauth-start`; handle `?strava=connected` return.
7. **Deploy**: Vercel project + env; `supabase functions deploy`; set Strava app callback domain to the Supabase functions domain.

## Verification (acceptance)
1. Magic-link login succeeds on laptop and iPhone Safari; non-provisioned email cannot sign in.
2. Connect Strava → routed through `strava-oauth-callback` → back to Settings showing "Connected as `<name>`".
3. Row present in `strava_tokens`; manually set `expires_at` to the past, reload Settings → athlete still loads (lazy refresh proven, row updated).
4. PWA installs on iPhone ("Add to Home Screen"); title/manifest read "Trent".

## Out of scope for Slice 1 (later slices)
Activity sync, schema for activities/streams, Training Load parsing, PBs, zone entry,
unit toggle, all dashboard analytics/views, gym log. Stubs only for nav routes.
