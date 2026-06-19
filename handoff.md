# Handoff: Trent — The Training Dashboard

## App name
**Trent** — "The Training Dashboard." Use this name in the UI (header/title),
package.json, README, PWA manifest (name + short_name), and page title.

## Purpose
Build a free, personal-use fitness dashboard that pulls from Strava (which itself
receives synced data from a COROS Pace 4 watch). Strava Premium-style trends,
personal bests, and training load analytics. Single user, multi-device (laptop
browser + iPhone Safari PWA).

## Tech stack
- React + Vite, PWA (installable via Safari "Add to Home Screen")
- Supabase: Postgres DB, Auth (magic link), Edge Functions (token refresh, sync jobs)
- Vercel: hosting/deployment
- Chart.js for trends visualizations (consistent with other personal projects)

## Auth
- Supabase magic link (passwordless email), restricted to a single allowed email
- No password gate, no multi-user support needed

## Strava integration
- OAuth 2.0 connect flow, single-player mode (personal use only — no need to
  request Strava's expanded developer tier)
- Tokens (access + refresh) stored server-side in a Supabase table keyed to the
  user row, NOT in browser storage — refresh handled via Supabase Edge Function
  so any device just hits our own backend
- Settings page has a "Reconnect Strava" button that re-runs OAuth and
  overwrites stored tokens (no disconnect confirmation flow needed — single user)
- Rate limits: 200 req/15min, 2000 req/day (default tier) — track usage via
  Strava's `X-Ratelimit-Usage` response header

## Sync model
- Manual "Sync now" button (no webhooks for v1)
- First sync: pulls last 3 months of activity (summary + full streams)
- "Sync older history" button: walks further back in time across multiple
  sessions, resuming from where it left off, to stay under daily rate limit
- Regular "Sync now" after backfill: pulls only activities since last sync
- On hitting rate limit mid-sync: stop gracefully, persist last successfully
  synced activity ID/timestamp, show user a message (e.g. "Synced 80
  activities, hit rate limit — resume tomorrow"). No silent failures.

## Activity types in scope (v1)
- **Run** — full GPS/HR/pace streams, best efforts, training load
- **Ride** — full GPS/HR/pace streams, training load (no power-based PBs —
  user has no power meter)
- **Weight Training (gym)** — duration + HR avg/max if present only. NO
  pace/elevation charts, NO training load badge, NO stream-heavy storage
  (Strava rarely has GPS/stream data for these anyway)

## Data storage
- Summary stats + full streams (GPS, HR, pace, elevation) per run/ride,
  stored in Supabase
- Gym sessions: summary only, no streams

## Training Load (COROS via Strava)
- COROS writes Training Load into the Strava activity description/notes field
  for run/ride activities, in this exact format: `"94 Training Load-- from COROS"`
- Parse with regex: `/(\d+)\s*Training Load/` → extract integer, store as
  `training_load` column on the activity row
- Null/skip gracefully for activities without this (manual entries,
  non-COROS-synced activities)
- NOT applicable to gym sessions

## Pace & HR zones
- COROS has no public API for zones (only an official MCP server, designed
  for AI agents, not directly suitable for a web app backend; a formal COROS
  API application process exists but approval/scope is unknown — decided
  against pursuing either for v1)
- **Decision: manual entry.** Settings page where user inputs 5 HR zone
  boundaries + 5 pace zone boundaries once (editable any time). Zones are
  derived from threshold HR/pace and are relatively stable, so this isn't a
  frequent chore.
- These manually-entered zone boundaries are then used to bucket the
  Strava stream data (HR/pace time series) into the zone distribution charts

## Personal Bests
- **Running**: use Strava's own `best_efforts` array (returned on detailed
  activity API calls) — Strava already calculates this server-side from
  validated GPS data. Track PB history over time per distance bucket
  (e.g. 1k, 5k, 10k, etc., whatever Strava provides).
- **Cycling**: Strava's `best_efforts` field is running-only — it does NOT
  populate for rides via the API (confirmed: Strava's UI shows cycling best
  efforts but the API doesn't expose the same distance-based calculation).
  Decision: **whole-ride bests only** for v1 — longest ride, fastest average
  pace/speed in a single ride, best elevation gain in a single ride. No
  sliding-window sub-distance calculation (e.g. "fastest 50km within a longer
  ride") — deferred as too complex for v1.
- **Gym**: no PB tracking.

## Recovery score
- Explicitly OUT of scope. COROS's recovery score blends HRV/sleep/resting HR
  which CANNOT be exported from COROS at all (confirmed via COROS support
  docs — daily metrics like HR/steps/HRV/sleep have no export path, and this
  data does not ride along in the Strava sync the way Training Load does).
  Decided not important enough to chase (e.g. via manual entry) for this user.

## Dashboard structure (4 main views)
1. **Overview/Home** — recent activity feed (cards per run/ride/gym session)
   + weekly summary stats (distance, time, elevation gain)
   - Activity feed supports filtering by activity type and date range
2. **Activity detail** — click into a run/ride → map, pace/HR/elevation
   graphs, splits table
3. **Trends** —
   - Personal bests tracker (running: Strava best_efforts; cycling: whole-ride
     bests)
   - Weekly/monthly distance-over-time graph
   - HR zone distribution chart (using manually-entered zone boundaries)
   - Pace distribution chart (aggregated across a selected time period —
     histogram of time spent per pace band, using manually-entered zone
     boundaries)
   - **ATL/CTL/Form chart** ("Performance Management Chart" style, same model
     as TrainingPeaks/COROS EvoLab):
     - ATL (Acute Training Load) = 7-day exponentially-weighted rolling
       average of `training_load`
     - CTL (Chronic Training Load) = 42-day exponentially-weighted rolling
       average of `training_load`
     - Form = CTL − ATL
     - Display: 3 metric cards (Fitness/CTL, Fatigue/ATL, Form) + line chart
       over time. Form gets traffic-light color coding (green = fresh/positive,
       red = fatigued/negative) AND shows the raw number.
   - Calendar/heatmap view (GitHub-contributions-style) showing activity
     consistency over the year
4. **Gym log** — simple list/calendar of sessions, no deep analytics

## Settings page
- Strava connection status + "Reconnect Strava" button
- Manual HR zone entry (5 boundaries)
- Manual pace zone entry (5 boundaries)
- Unit preference toggle: metric (km/kg) vs imperial (miles/lbs) — affects
  all displayed distances/paces/weights app-wide

## Explicitly deferred / out of scope for v1
- Webhook-based auto-sync (manual sync only for now)
- Cycling power-based PBs (user has no power meter)
- Cycling sliding-window sub-distance PBs
- Recovery score (any form)
- Multi-user / multi-athlete support
- Swim or other activity types beyond run/ride/gym

## Suggested skills to invoke in the next session
- `frontend-design` — for dashboard visual design (cards, charts, layout)
- `emil-design-eng` — for UI polish/animation/interaction details
- Public skills for relevant file types if generating any doc/report alongside
  the build

## Open implementation questions for Claude Code to resolve
- Exact Supabase schema (tables for activities, streams, training_load,
  zones, settings) — not yet drafted, needs designing from this spec
- Whether stream data (GPS/HR/pace time series) should be stored as JSON
  blobs per activity or normalized into a time-series table — worth
  evaluating against Supabase free tier storage limits (500MB) given "full
  history" sync goal
- ATL/CTL exponential weighting implementation detail (smoothing constant
  choice — standard TrainingPeaks uses 1-e^(-1/7) and 1-e^(-1/42) for the
  EWMA decay)
- OAuth redirect URI handling across local dev vs Vercel production
