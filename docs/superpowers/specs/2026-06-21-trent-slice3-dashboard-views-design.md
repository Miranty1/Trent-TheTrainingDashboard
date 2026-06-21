# Trent — Slice 3: Dashboard Views (Overview, Activity Detail, Gym)

## Context

Slice 1 shipped the foundation (Vite/React PWA, magic-link auth, server-side
Intervals.icu connection). Slice 2 shipped the data schema (`activities`,
`streams`, `wellness`, `sync_state`) and the `sync` edge function, with
owner-SELECT RLS so the client can read these tables directly with the user
session. The four dashboard routes are still stubs and there is no styling.

Slice 3 renders the synced data into real, usable views. It is the **first UI
slice**, so it establishes the visual/design system and client data-access
patterns that Slice 4 (PBs, zone distributions, readiness score, Trends) inherits.

### Decisions locked during brainstorming
- **Scope:** Overview + Activity Detail + Gym. **Trends is deferred to Slice 4**
  (its charts depend on Slice-4 computations: PBs, zones, readiness).
- **Design ambition:** polished/distinctive — invoke the **frontend-design**
  skill to build a real dark-theme design language.
- **Map:** **Leaflet + OpenStreetMap** (free, no API key) for the GPS route.
- **Units:** **hardcode metric** (km, min/km, m) this slice; a metric/imperial
  toggle is a later slice. All unit logic lives behind `src/lib/format.js`.
- **Reads:** direct supabase-js queries with the user session (owner-SELECT RLS);
  no new edge functions.
- **Splits:** computed per-km from distance+time streams (Intervals'
  interval-detection lives on the detail endpoint, used in Slice 4 for PBs).
- **Feed pagination:** "Load more" (cursor on `start_date`), not infinite scroll.

## Architecture

- **`src/lib/format.js`** — pure metric formatters: `formatDistance`,
  `formatPace` (from m/s), `formatDuration`, `formatElevation`, `formatDate`.
  The single seam a future units toggle edits.
- **`src/lib/streams.js`** — pure `streamsByType(rawArray)` and
  `computeSplits(streamsObj)` (per-full-km splits with avg HR).
- **`src/lib/data.js`** — thin supabase read wrappers: `listActivities`,
  `getActivity`, `getStreams`, `listGymSessions`, `weeklyTotals` + pure
  `sumTotals`. Owner-SELECT RLS auto-scopes rows; queries never filter `user_id`.
- **Design system** — `src/index.css` tokens + classes; shared `MetricCard` and
  `ActivityCard` components; styled `NavBar`.

## Views

### Overview (`/`)
- Weekly summary strip: this-week distance / moving time / elevation as
  `MetricCard`s (`weeklyTotals` from start-of-week).
- Recent activity feed: `ActivityCard` per activity (all types). Run/Ride link to
  detail; Gym/Hike are summary-only.
- Filters: activity type chips + from/to date inputs. "Load more" pagination
  (page 25, `before`-cursor on `start_date`).

### Activity Detail (`/activity/:id`)
- Loads the summary; lazy-loads `streams` only here.
- Run/Ride: Leaflet+OSM map (GPS polyline, fit bounds); pace / HR / elevation
  charts (chart.js + react-chartjs-2); per-km splits table; summary header.
- Gym/Hike/other: summary header only (duration, HR avg/max) — no map/charts.
- States: loading, not-found, "no GPS data".

### Gym (`/gym`)
- Reverse-chronological table of `WeightTraining` sessions (date, name, duration,
  HR avg/max). No charts, no detail link.

## Testing & verification
- Unit: `format.js`, `streams.js` (parsing + splits), `data.js` (`sumTotals` +
  query-builder filter/cursor calls via a mocked supabase client).
- Component (Testing Library, mocked data layer): `MetricCard`/`ActivityCard`
  (Run links, Gym summary-only); Overview feed + totals + Load more; Activity
  Detail Run-full vs Gym-summary branching (RouteMap/StreamChart mocked); Gym list.
- Manual: sync real data → Overview totals + feed; open a Run → map + charts +
  splits; open Gym/Hike → summary-only; Gym tab lists sessions. `npm test` and
  `npm run lint` clean.

## Out of scope (Slice 4+)
- Trends view and all its charts (distance-over-time, HR/pace zone distributions,
  CTL/ATL/Form, readiness trend, calendar/heatmap).
- Personal bests / best-efforts (detail-endpoint fetch), readiness score.
- Metric/imperial units toggle + settings persistence; manual zone entry.
- Webhook auto-sync.
