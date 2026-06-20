# Trent — The Training Dashboard: Slice 1 (Foundation & Intervals.icu Connection)

> **Revised 2026-06-21:** Data source switched from Strava (OAuth) to Intervals.icu
> (API key). Strava began requiring a paid subscription for API access (~June 2026);
> Intervals.icu has a free REST API and receives COROS data via the official
> COROS→Intervals.icu sync, so Strava is no longer in the pipeline.

## Context

`handoff.md` specifies a free, single-user fitness dashboard ("Trent") that pulls data
from Intervals.icu (which receives COROS Pace 4 data) and renders Premium-style trends,
PBs, training-load, and readiness analytics.

The full app is decomposed into ordered slices:

1. **Foundation & Intervals.icu connection** ← this spec
2. Data schema & sync engine (activities, streams, wellness; resumable sync; training load from Intervals' computed value)
3. Core dashboard (Overview + Activity detail + full Settings)
4. Trends & analytics (PBs, distance-over-time, zone distributions, ATL/CTL/Form from Intervals wellness, Readiness score composite, heatmap)
5. Gym log

This spec covers **Slice 1 only**: stand up the app + app-login auth + a working
Intervals.icu connection. End state: *"I can log in on laptop or iPhone, enter my
Intervals.icu API key + athlete ID, and see 'Connected as &lt;name&gt;' — with the key
stored server-side, never exposed to the browser."*

### Decisions locked
- **Data-source auth:** Intervals.icu API key via HTTP Basic auth (username `API_KEY`,
  password = the key). No OAuth, no token refresh.
- **Key stays server-side:** all Intervals.icu calls go through Supabase Edge Functions
  that read the key from the DB via the service role; the browser never receives it.
- **Athlete ID:** the user enters both the API key and the athlete ID in Settings.
- **App login:** Supabase magic link; public signups disabled, single user pre-provisioned.

## Tech stack
- React + Vite, `react-router-dom`, `vite-plugin-pwa` (installable PWA)
- Chart.js installed but unused until later slices
- Supabase: Postgres, Auth (magic link), Edge Functions (Deno)
- Vercel: frontend hosting

## Architecture

### Repo layout (single repo)
- `src/` — Vite React app
- `supabase/functions/` — Edge Functions (`intervals-save-key`, `intervals-athlete`, shared `_shared/intervals.ts`)
- `supabase/migrations/` — SQL for tables + RLS

### App auth
- Magic link; public signups disabled, single user pre-provisioned (Supabase dashboard).
- Login page (email → magic link), session persisted by supabase-js, protected routes redirect to `/login`.

### Intervals.icu connection
- **`intervals-save-key`** (authed Edge Function): verifies the caller's Supabase JWT →
  user_id; accepts `{ apiKey, athleteId }`; validates by calling
  `GET /athlete/{athleteId}` before persisting; on success upserts `intervals_credentials`
  and returns `{ ok: true, athlete }`; on failure returns a 4xx and saves nothing.
- **`intervals-athlete`** (authed Edge Function): reads stored credentials, calls
  `GET /athlete/{athlete_id}` via the shared helper, returns `{ connected: true, athlete }`
  or `{ connected: false }` when no key is stored. Drives the Settings status display.

### Data model (migrations)
- `intervals_credentials`: `user_id` uuid (PK, FK `auth.users` on delete cascade),
  `api_key` text not null, `athlete_id` text not null, `updated_at` timestamptz default now().
  **RLS enabled with no client policies** (service-role only): the api_key is never
  readable by the browser. Connection status comes from an Edge Function, not client SELECT.

### Shared helper `_shared/intervals.ts`
- `adminClient()` — service-role Supabase client.
- `intervalsFetch(apiKey, path)` — GET `https://intervals.icu/api/v1{path}` with
  `Authorization: Basic base64("API_KEY:" + apiKey)`; returns the `Response`.
- `getCredentials(admin, userId)` — returns `{ api_key, athlete_id }` or throws.

### Frontend (Slice 1's only real surface beyond login)
- Settings page: connection status — "Connected as `<name>`" or "Not connected" — and a
  form with **API key** + **athlete ID** fields. Submitting calls `intervals-save-key`;
  "Reconnect" is re-entry of the key. Other nav routes are stubs.
- PWA: manifest `name` "Trent — The Training Dashboard", `short_name` "Trent"; service
  worker via `vite-plugin-pwa`. Page `<title>` = "Trent".

### Secrets / config
- Edge Function env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
  (all Supabase-provided). No app-level data-source secret — the Intervals.icu key is
  per-user data in the DB.
- Frontend env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

## Implementation steps
1. **Scaffold** Vite React app; Trent naming in `package.json`, `index.html` title, README. Deps: `react-router-dom`, `chart.js`, `@supabase/supabase-js`, `vite-plugin-pwa`. *(done)*
2. **PWA manifest** (name/short_name "Trent") + service worker via `vite-plugin-pwa`. *(done)*
3. **Supabase project**: init `supabase/`; migration for `intervals_credentials` with RLS. Disable public signups; pre-provision the single user.
4. **Frontend auth**: supabase client, magic-link login page, session context, protected route wrapper, app shell + nav with stub routes.
5. **Shared helper** `_shared/intervals.ts` (`intervalsFetch`, `adminClient`, `getCredentials`).
6. **Edge Functions**: `intervals-save-key`, `intervals-athlete`. Set function env.
7. **Settings page**: status via `intervals-athlete`; save via `intervals-save-key` (API key + athlete ID).
8. **Deploy**: Vercel project + env; `supabase functions deploy`.

## Verification (acceptance)
1. Magic-link login succeeds on laptop and iPhone Safari; a non-provisioned email cannot sign in.
2. Enter API key + athlete ID in Settings → saved → status shows "Connected as `<name>`". A bad key returns an error and saves nothing.
3. Row present in `intervals_credentials`; confirm no browser network response ever contains `api_key`.
4. PWA installs on iPhone ("Add to Home Screen"); title/manifest read "Trent".

## Out of scope for Slice 1 (later slices)
Activity/wellness sync and schema, training-load handling, PBs, readiness score, zone
entry, unit toggle, all dashboard analytics/views, gym log. Stubs only for nav routes.
