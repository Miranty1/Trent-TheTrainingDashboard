# Handoff: Trent — The Training Dashboard

## App name
**Trent** — "The Training Dashboard." Use this name in the UI (header/title),
package.json, README, PWA manifest (name + short_name), and page title.

## Purpose
Build a free, personal-use fitness dashboard. Strava Premium-style trends,
personal bests, training load, and readiness analytics. Single user,
multi-device (laptop browser + iPhone Safari PWA).

## Tech stack
- React + Vite, PWA (installable via Safari "Add to Home Screen")
- Supabase: Postgres DB, Auth (magic link), Edge Functions (token refresh
  not needed for API key auth, but useful for scheduled sync jobs if added later)
- Vercel: hosting/deployment
- Chart.js for trends visualizations

## Auth (app login)
- Supabase magic link (passwordless email), restricted to a single allowed email
- No password gate, no multi-user support needed

## Data source: Intervals.icu (NOT Strava)
**Why:** Strava now requires a paid subscription for API access (changed
~June 2026). Intervals.icu has a genuinely free, open REST API with no
subscription gate. COROS syncs directly to Intervals.icu (officially
supported), so Strava isn't needed in the pipeline at all.

```
COROS watch → COROS app → Intervals.icu (direct, official sync)
                                ↓
                    Trent (via free Intervals.icu REST API)
```

- Auth: API key (Settings → Developer Settings on intervals.icu), much
  simpler than OAuth — no token refresh flow needed
- Base URL: `https://intervals.icu/api/v1/athlete/{ATHLETE_ID}/...`
- Auth header: Basic auth, username `API_KEY`, password = the actual key
- No published rate limits, but be respectful with request frequency
- Store the API key in a Supabase table (server-side), never in browser
  storage/client code
- Settings page: "Reconnect Intervals.icu" — simple re-entry of API key if
  it ever needs rotating

### Key endpoints to use
- `GET /athlete/{id}/activities` — activity list (run/ride/gym etc.)
- `GET /athlete/{id}/activities/{activityId}` — activity detail incl.
  best-effort/power-curve data, automatic interval detection
- `GET /athlete/{id}/activities/{activityId}/streams` — GPS/HR/pace/elevation
  time-series data
- `GET /athlete/{id}/wellness?oldest=...&newest=...&fields=...` — daily
  wellness records. Confirm exact field names against current API docs
  before building (naming may be camelCase or snake_case depending on
  endpoint — verify, don't assume):
  - `restingHR` / `resting_hr`
  - `hrv`
  - `sleepSecs` / `sleep_secs`
  - `weight`
  - `soreness`, `fatigue`, `mood` (subjective scores)
  - **`ctl` (fitness), `atl` (fatigue), `rampRate`** — already computed by
    Intervals.icu, no need to calculate ATL/CTL ourselves (see Training
    Load section below)

## Sync model
- Manual "Sync now" button (no webhooks for v1)
- First sync: pulls last 3 months of activity (summary + full streams) +
  wellness data for the same period
- "Sync older history" button: walks further back across multiple sessions
  to backfill full history over time
- Regular "Sync now" after backfill: pulls only activities/wellness since
  last sync
- No Strava-style hard rate limit to defend against, but still implement
  graceful error handling and progress persistence (resume from last
  successfully synced date if a sync run is interrupted)

## Activity types in scope (v1)
- **Run** — full GPS/HR/pace streams, best efforts, training load
- **Ride** — full GPS/HR/pace streams, training load, whole-ride PBs only
  (no power-based PBs — user has no power meter; no sliding-window
  sub-distance PBs)
- **Weight Training (gym)** — duration + HR avg/max if present only. NO
  pace/elevation charts, NO training load badge/chart inclusion, NO
  stream-heavy storage

## Data storage
- Summary stats + full streams (GPS, HR, pace, elevation) per run/ride,
  stored in Supabase
- Gym sessions: summary only, no streams
- Daily wellness records (HRV, RHR, sleep, CTL/ATL/rampRate) stored in a
  separate `wellness` table, one row per date

## Training Load & ATL/CTL/Form
- Intervals.icu already computes `ctl`, `atl`, and `rampRate` per day on the
  wellness endpoint — **fetch and chart directly, do not recompute the EWMA
  ourselves.** This significantly simplifies what was originally scoped as a
  custom calculation.
- Form = `ctl - atl` (can compute this trivially client-side, or check if
  Intervals.icu also returns a form/TSB-equivalent field directly — verify
  against live API response)
- Display: 3 metric cards (Fitness/CTL, Fatigue/ATL, Form) + line chart over
  time. Form gets traffic-light color coding (green = fresh/positive, red =
  fatigued/negative) AND shows the raw number.
- Per-activity Training Load badge: check whether Intervals.icu exposes a
  per-activity load value directly (likely does, given it computes CTL/ATL
  from somewhere) — if so, use that instead of any text-parsing approach.
  (NOTE: the original plan involved regex-parsing a "Training Load" string
  COROS writes into Strava activity descriptions — this is NO LONGER NEEDED
  since we're not using Strava. Intervals.icu's own computed load value
  should be used instead.)
- NOT applicable to gym sessions

## Readiness Score (composite, v1 — built from scratch, not COROS's algorithm)
COROS's own recovery score formula is proprietary and not exposed via any
API (confirmed — Intervals.icu wellness data has the raw inputs (HRV, RHR)
but not a pre-blended COROS recovery %). Build Trent's own composite score:

**Formula:**
```
Readiness (0-100) = 0.40 × HRV_component + 0.30 × RHR_component + 0.30 × Form_component
```

- **HRV_component**: today's HRV vs. 30-day rolling baseline average,
  normalized to 0-100 (higher HRV relative to baseline = higher score)
- **RHR_component**: today's resting HR vs. 30-day rolling baseline average,
  normalized to 0-100, **inverted** (higher RHR relative to baseline = lower
  score)
- **Form_component**: derived from `ctl - atl` (see above), normalized to
  0-100

Exact normalization method (e.g. z-score clamped to a range, or simple
percentage deviation mapped to 0-100) is an open implementation detail —
recommend starting with a simple percentage-deviation approach and
iterating once real data is flowing.

**Display:**
- Single 0-100 numeric score AND a label, with color bands:
  - 0-39: red ("Low" / needs rest)
  - 40-69: amber ("Moderate")
  - 70-100: green ("Ready to train")
- Show breakdown of the 3 weighted components (progress bars or similar) so
  the score isn't a black box
- Placement: [NOT YET DECIDED — see open question below]

## Pace & HR zones
- No public API for COROS zones beyond what's manually entered. **Decision:
  manual entry.** Settings page where user inputs 5 HR zone boundaries + 5
  pace zone boundaries once (editable any time).
- Used to bucket stream data (HR/pace time series) into zone distribution
  charts in Trends

## Personal Bests
- **Running**: Intervals.icu performs automatic interval detection and
  computes best-effort data per activity (similar to what Strava's
  `best_efforts` provided) — use this instead of Strava's field. Verify
  exact field/endpoint shape against live API response before building.
  Track PB history over time per distance bucket.
- **Cycling**: whole-ride bests only — longest ride, fastest average
  pace/speed in a single ride, best elevation gain in a single ride. No
  sliding-window sub-distance calculation, no power-based PBs.
- **Gym**: no PB tracking.

## Dashboard structure (4 main views)
1. **Overview/Home** — recent activity feed (cards per run/ride/gym session)
   + weekly summary stats (distance, time, elevation gain). Feed supports
   filtering by activity type and date range. [Readiness score placement
   TBD — see open question]
2. **Activity detail** — click into a run/ride → map, pace/HR/elevation
   graphs, splits table
3. **Trends** —
   - Personal bests tracker
   - Weekly/monthly distance-over-time graph
   - HR zone distribution chart (manually-entered zone boundaries)
   - Pace distribution chart (aggregated, histogram of time per pace band)
   - ATL/CTL/Form chart (sourced directly from Intervals.icu wellness data)
   - Readiness score trend (historical line chart of the composite score)
   - Calendar/heatmap view (GitHub-contributions-style) showing activity
     consistency over the year
4. **Gym log** — simple list/calendar of sessions, no deep analytics

## Settings page
- Intervals.icu API key entry/reconnect
- Manual HR zone entry (5 boundaries)
- Manual pace zone entry (5 boundaries)
- Unit preference toggle: metric (km/kg) vs imperial (miles/lbs)

## Explicitly deferred / out of scope for v1
- Webhook-based auto-sync (manual sync only for now)
- Cycling power-based PBs (user has no power meter)
- Cycling sliding-window sub-distance PBs
- Replicating COROS's actual recovery algorithm (proprietary, inaccessible
  — building Trent's own composite instead, see above)
- Multi-user / multi-athlete support
- Swim or other activity types beyond run/ride/gym
- Strava integration (deliberately dropped due to subscription requirement)

## Suggested skills to invoke in the next session
- `frontend-design` — for dashboard visual design (cards, charts, layout)
- `emil-design-eng` — for UI polish/animation/interaction details

## Open implementation questions for Claude Code to resolve
- Exact Supabase schema (tables for activities, streams, wellness,
  zones, settings) — not yet drafted, needs designing from this spec
- Whether stream data should be stored as JSON blobs per activity or
  normalized into a time-series table — evaluate against Supabase free
  tier storage limits (500MB) given "full history" sync goal
- **Verify live Intervals.icu API responses before building** — field
  names, best-effort data shape, and whether a form/TSB field is already
  computed all need confirming against actual API output, not just docs/
  forum posts, since some details (e.g. exact wellness field casing) were
  inconsistent across sources during research
- Readiness score normalization method (z-score vs. percentage deviation)
- **OPEN — not yet decided with user**: should the readiness score live on
  Overview/Home (daily glance) or Trends (with other charts), or both? Ask
  before building this screen.
- OAuth/API key handling across local dev vs. Vercel production environments
