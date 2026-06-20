# Trent — Slice 2: Data Schema & Sync Engine

## Context

Slice 1 shipped the foundation: a Vite/React PWA, Supabase magic-link login, and a
server-side Intervals.icu connection (API key in `intervals_credentials`, accessed only
via edge functions). Slice 2 makes Trent actually pull and persist training data from
Intervals.icu so later slices can render it.

This design was validated against the **live Intervals.icu API** for the real account
(athlete `i618398`), resolving the handoff's open questions:
- Per-activity training load is `icu_training_load` on the activity summary (no text parsing).
- Activity summaries are **snake_case**; wellness records are **camelCase** with `id` = the date.
- The streams endpoint is `GET /api/v1/activity/{id}/streams` (singular `activity`), returning
  `[{ type, data: [...] }]` at ~1 Hz (a ~99-min run ≈ 5,964 points/stream).
- Available activity types include Run, WeightTraining, and **Hike**.
- **HRV is not populated** for this account (0/31 recent days); restingHR and sleep are 100%.
  (Flag for the Slice 4 readiness score, which the handoff weighted 40% on HRV.)

### Decisions locked during brainstorming
- **Stream storage:** one row per activity in a `streams` table holding the full-resolution
  series as JSONB, lazy-loaded only on Activity Detail. (Not normalized rows; not external storage.)
- **Activity scope:** tiered — sync *every* type as a summary; fetch streams + enable full
  analytics only for Run/Ride; gym/hike/other appear as summary-only.
- **Reads:** dashboard tables use RLS owner-SELECT so Slices 3/4 read them directly with the
  user session; only the service-role sync function writes.

## Data model (migrations)

All tables: RLS enabled, an **owner-SELECT** policy (`auth.uid() = user_id`), and **no
insert/update/delete policies** (writes happen via the service-role sync function).

### `activities` (one row per activity, all types)
- `id` text PK (Intervals activity id, e.g. `i158780686`)
- `user_id` uuid FK `auth.users` on delete cascade
- `type` text, `sub_type` text, `name` text
- `start_date` timestamptz (UTC, for ordering), `start_date_local` text
- `distance` real, `moving_time` int, `elapsed_time` int, `total_elevation_gain` real
- `training_load` int (from `icu_training_load`), `intensity` real (from `icu_intensity`)
- `average_heartrate` int, `max_heartrate` int, `average_cadence` real
- `average_speed` real, `max_speed` real
- `calories` int, `gear` text, `feel` int, `trainer` boolean, `source` text
- `raw` jsonb (full summary payload, for future fields without re-sync)
- `synced_at` timestamptz default now()
- Indexes: `(user_id, start_date desc)`, `(user_id, type)`

### `streams` (Run/Ride only, lazy-loaded)
- `activity_id` text PK FK `activities(id)` on delete cascade
- `user_id` uuid FK `auth.users` on delete cascade
- `data` jsonb (the `[{ type, data: [...] }]` array as returned)
- `synced_at` timestamptz default now()

### `wellness` (one row per day)
- PK `(user_id, date)`; `user_id` uuid FK `auth.users` on delete cascade; `date` date
- `ctl` real, `atl` real, `ramp_rate` real
- `resting_hr` int, `hrv` real, `sleep_secs` int, `weight` real, `readiness` int
- `raw` jsonb, `synced_at` timestamptz default now()
- Form (`ctl − atl`) is computed in the app, not stored.

### `sync_state` (resume/progress, one row per user)
- `user_id` uuid PK FK `auth.users` on delete cascade
- `last_activity_date` timestamptz (newest synced activity start; null until first sync)
- `backfill_oldest_date` date (oldest date reached by backfill; null until first sync)
- `status` text, `message` text, `updated_at` timestamptz default now()

## Edge function `sync` (authed)

Resolves the user from the JWT, reads credentials via the service-role client, calls
Intervals.icu, and upserts. CORS-enabled (same shared helper as Slice 1). Body `{ mode }`:

- **`"recent"`** ("Sync now"): window = `last_activity_date` → today, or last 3 months on first
  run. Fetch `/athlete/{id}/activities` + `/athlete/{id}/wellness` for the window; upsert all
  activities (every type) and wellness rows; for new **Run/Ride** fetch `/activity/{id}/streams`
  and upsert `streams`. Advance `last_activity_date`. On first run also set `backfill_oldest_date`
  to the window start.
- **`"backfill"`** ("Sync older history"): process one bounded batch going back from
  `backfill_oldest_date` (a date window capped to ~30 activities and the streams fetched within
  it, to stay within the edge timeout). Upsert, advance `backfill_oldest_date`, return
  `{ done, syncedCount, oldestReached }`.

**Mapping:** dedicated pure functions map Intervals JSON → row shape
(`mapActivity`, `mapWellness`) so they are unit-testable without network/DB.

**Graceful failure:** wrap each activity; on error persist progress to `sync_state` and return a
clear message (`"Synced N, stopped at <date>: <reason>"`). No silent failures; always resumable.

## Frontend (thin — full views are Slice 3)

Add to the Settings page, below the connection status:
- **Sync now** button → calls `sync` with `mode: "recent"`, shows result/progress.
- **Sync older history** button → calls `sync` with `mode: "backfill"` repeatedly, auto-continuing
  batch-by-batch with a progress indicator until `done`, with a Stop control.
- Show `sync_state` summary (last synced, oldest backfilled, last message).

No Overview/feed/detail rendering in this slice — those read these tables in Slice 3.

## Verification
1. Connect (Slice 1), click **Sync now** → `activities` populated including the Hike (summary-only),
   `wellness` populated, `streams` rows present for runs. Verify via supabase-js select / dashboard.
2. **Sync older history** walks further back; interrupt it, confirm `backfill_oldest_date` persisted,
   resume and confirm it continues from there.
3. Re-running **Sync now** with no new activities is a no-op (idempotent upserts).
4. Unit tests: `mapActivity` / `mapWellness` against captured sample payloads; the batch/cursor advance logic.

## Out of scope (later slices)
- All dashboard views — Overview feed, Activity Detail, Trends (Slice 3/4).
- Best-efforts / PB capture, zone distributions, readiness score (Slice 4). PB history in Slice 4
  may add a per-activity *detail* fetch, since best-efforts live on the activity detail endpoint,
  not the summary.
- Webhook auto-sync (manual only for v1).
