# Trent Slice 2 (Data Schema & Sync Engine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull activities, streams, and daily wellness from Intervals.icu into Supabase via a resumable sync edge function, so later slices can render the data.

**Architecture:** Four RLS-protected Postgres tables (`activities`, `streams`, `wellness`, `sync_state`) readable by the owner and written only by a service-role edge function `sync`. The function maps Intervals JSON → rows via pure, unit-tested functions, supports a `recent` mode (incremental / first 3 months) and a bounded, resumable `backfill` mode. A thin Settings panel drives it.

**Tech Stack:** Supabase Postgres + Edge Functions (Deno/TS), React/Vite frontend, vitest (frontend) + `deno test` (functions). Reuses Slice 1's `_shared/intervals.ts` (Basic-auth `intervalsFetch`, `adminClient`, `getCredentials`, `corsHeaders`, `jsonResponse`).

## Global Constraints

- Intervals.icu auth/access only via edge functions (key never reaches the browser); reuse `intervalsFetch`/`adminClient`/`getCredentials` from `supabase/functions/_shared/intervals.ts`.
- API shapes (verified live): activities are **snake_case** (`icu_training_load`, `icu_intensity`, `average_heartrate`, `start_date`, `start_date_local`); wellness is **camelCase** with `id` = the date (`ctl`, `atl`, `rampRate`, `restingHR`, `hrv`, `sleepSecs`); streams come from `GET /api/v1/activity/{id}/streams` as `[{type,data:[]}]`.
- Endpoints: `GET /athlete/{id}/activities?oldest=YYYY-MM-DD&newest=YYYY-MM-DD`, `GET /athlete/{id}/wellness?oldest=&newest=`, `GET /activity/{id}/streams?types=...`.
- Stream storage: full-resolution JSON blob, one row per activity in `streams`, only for **Run/Ride**.
- Activity scope: sync **every** type as a summary; streams only for Run/Ride.
- All four tables: RLS enabled, owner-SELECT policy (`auth.uid() = user_id`), no write policies (service-role writes only).
- Edge functions must handle the CORS preflight (`OPTIONS`) and return `corsHeaders` on every response.
- Sync must be idempotent (upserts), resumable from `sync_state`, and never fail silently — persist progress and return a clear message on error.
- First sync window: last 90 days. Backfill window: 30 days per batch.

---

### Task 1: Schema migration (activities, streams, wellness, sync_state)

**Files:**
- Create: `supabase/migrations/0002_sync_schema.sql`

**Interfaces:**
- Produces: tables `activities`, `streams`, `wellness`, `sync_state` with RLS owner-SELECT. Consumed by Tasks 4 (writes via service role) and later slices (reads).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0002_sync_schema.sql`:

```sql
-- activities: one row per activity, all types
create table public.activities (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text,
  sub_type text,
  name text,
  start_date timestamptz,
  start_date_local text,
  distance real,
  moving_time int,
  elapsed_time int,
  total_elevation_gain real,
  training_load int,
  intensity real,
  average_heartrate int,
  max_heartrate int,
  average_cadence real,
  average_speed real,
  max_speed real,
  calories int,
  gear text,
  feel int,
  trainer boolean,
  source text,
  raw jsonb,
  synced_at timestamptz not null default now()
);
create index activities_user_start on public.activities (user_id, start_date desc);
create index activities_user_type on public.activities (user_id, type);

-- streams: Run/Ride only, lazy-loaded full-resolution blob
create table public.streams (
  activity_id text primary key references public.activities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  synced_at timestamptz not null default now()
);

-- wellness: one row per day
create table public.wellness (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  ctl real,
  atl real,
  ramp_rate real,
  resting_hr int,
  hrv real,
  sleep_secs int,
  weight real,
  readiness int,
  raw jsonb,
  synced_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- sync_state: resume/progress, one row per user
create table public.sync_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_activity_date timestamptz,
  backfill_oldest_date date,
  status text,
  message text,
  updated_at timestamptz not null default now()
);

alter table public.activities enable row level security;
alter table public.streams enable row level security;
alter table public.wellness enable row level security;
alter table public.sync_state enable row level security;

create policy "owner reads activities" on public.activities for select using (auth.uid() = user_id);
create policy "owner reads streams"    on public.streams    for select using (auth.uid() = user_id);
create policy "owner reads wellness"   on public.wellness   for select using (auth.uid() = user_id);
create policy "owner reads sync_state" on public.sync_state for select using (auth.uid() = user_id);
-- No insert/update/delete policies: the service-role sync function bypasses RLS for writes.
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push`
Expected: four tables created; `supabase db lint` reports no errors.

- [ ] **Step 3: Verify tables exist and RLS blocks anon writes**

Run: `supabase db push --dry-run` (expect "no changes") and, against the REST API with the anon key, `curl -s -o /dev/null -w "%{http_code}\n" "$SUPABASE_URL/rest/v1/activities?select=id" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"`
Expected: `200` with `[]` (table reachable, RLS yields no rows for anon).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_sync_schema.sql
git commit -m "feat: add activities, streams, wellness, sync_state schema"
```

---

### Task 2: Pure mapping functions (Intervals JSON → rows)

**Files:**
- Create: `supabase/functions/_shared/map.ts`
- Test: `supabase/functions/_shared/map.test.ts`

**Interfaces:**
- Produces:
  - `mapActivity(a: Record<string, unknown>, userId: string): ActivityRow`
  - `mapWellness(w: Record<string, unknown>, userId: string): WellnessRow`
  - These are dependency-free (no imports) so `deno test` runs them without fetching remote modules. Consumed by Task 4.

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/map.test.ts`:

```ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { mapActivity, mapWellness } from './map.ts'

Deno.test('mapActivity maps snake_case + icu_* fields', () => {
  const a = {
    id: 'i158780686', type: 'Run', sub_type: null, name: 'Afternoon Run',
    start_date: '2026-06-20T04:05:47Z', start_date_local: '2026-06-20T14:05:47',
    distance: 15012.18, moving_time: 5954, elapsed_time: 5987, total_elevation_gain: 69.98,
    icu_training_load: 94, icu_intensity: 75.18, average_heartrate: 152, max_heartrate: 168,
    average_cadence: 80, average_speed: 2.519, max_speed: 3.1, calories: 1366,
    gear: { name: 'Pegasus' }, feel: 3, trainer: null, source: 'GARMIN_CONNECT',
  }
  const row = mapActivity(a, 'user-1')
  assertEquals(row.id, 'i158780686')
  assertEquals(row.user_id, 'user-1')
  assertEquals(row.training_load, 94)
  assertEquals(row.intensity, 75.18)
  assertEquals(row.gear, 'Pegasus')      // object-or-string handled
  assertEquals(row.trainer, null)
  assertEquals(row.raw, a)                // full payload retained
})

Deno.test('mapWellness maps camelCase + date id', () => {
  const w = { id: '2026-06-21', ctl: 15.4, atl: 28.6, rampRate: 2.91, restingHR: 53, hrv: null, sleepSecs: 26640, weight: null, readiness: null }
  const row = mapWellness(w, 'user-1')
  assertEquals(row.date, '2026-06-21')
  assertEquals(row.user_id, 'user-1')
  assertEquals(row.ramp_rate, 2.91)
  assertEquals(row.resting_hr, 53)
  assertEquals(row.hrv, null)
  assertEquals(row.sleep_secs, 26640)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test supabase/functions/_shared/map.test.ts`
Expected: FAIL ("Module not found" / exports missing).

- [ ] **Step 3: Implement the mappers**

Create `supabase/functions/_shared/map.ts`:

```ts
// Pure, dependency-free mappers from Intervals.icu JSON to DB row shapes.
type Json = Record<string, any>

export interface ActivityRow {
  id: string; user_id: string; type: string | null; sub_type: string | null; name: string | null
  start_date: string | null; start_date_local: string | null
  distance: number | null; moving_time: number | null; elapsed_time: number | null
  total_elevation_gain: number | null; training_load: number | null; intensity: number | null
  average_heartrate: number | null; max_heartrate: number | null; average_cadence: number | null
  average_speed: number | null; max_speed: number | null; calories: number | null
  gear: string | null; feel: number | null; trainer: boolean | null; source: string | null; raw: Json
}

export interface WellnessRow {
  user_id: string; date: string; ctl: number | null; atl: number | null; ramp_rate: number | null
  resting_hr: number | null; hrv: number | null; sleep_secs: number | null
  weight: number | null; readiness: number | null; raw: Json
}

const n = <T,>(v: T | undefined): T | null => (v === undefined ? null : v)

export function mapActivity(a: Json, userId: string): ActivityRow {
  return {
    id: a.id, user_id: userId,
    type: n(a.type), sub_type: n(a.sub_type), name: n(a.name),
    start_date: n(a.start_date), start_date_local: n(a.start_date_local),
    distance: n(a.distance), moving_time: n(a.moving_time), elapsed_time: n(a.elapsed_time),
    total_elevation_gain: n(a.total_elevation_gain),
    training_load: n(a.icu_training_load), intensity: n(a.icu_intensity),
    average_heartrate: n(a.average_heartrate), max_heartrate: n(a.max_heartrate),
    average_cadence: n(a.average_cadence), average_speed: n(a.average_speed), max_speed: n(a.max_speed),
    calories: n(a.calories),
    gear: typeof a.gear === 'string' ? a.gear : (a.gear?.name ?? null),
    feel: n(a.feel), trainer: n(a.trainer), source: n(a.source),
    raw: a,
  }
}

export function mapWellness(w: Json, userId: string): WellnessRow {
  return {
    user_id: userId, date: w.id,
    ctl: n(w.ctl), atl: n(w.atl), ramp_rate: n(w.rampRate),
    resting_hr: n(w.restingHR), hrv: n(w.hrv), sleep_secs: n(w.sleepSecs),
    weight: n(w.weight), readiness: n(w.readiness),
    raw: w,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test supabase/functions/_shared/map.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/map.ts supabase/functions/_shared/map.test.ts
git commit -m "feat: pure Intervals.icu activity/wellness mappers"
```

---

### Task 3: Intervals fetch helpers for activities/wellness/streams

**Files:**
- Modify: `supabase/functions/_shared/intervals.ts`

**Interfaces:**
- Consumes: existing `intervalsFetch(apiKey, path)`.
- Produces:
  - `getActivities(apiKey, athleteId, oldest, newest): Promise<any[]>`
  - `getWellness(apiKey, athleteId, oldest, newest): Promise<any[]>`
  - `getStreams(apiKey, activityId): Promise<any>`
  - `oldest`/`newest` are `YYYY-MM-DD` strings. Each throws `Error` on non-2xx. Consumed by Task 4.

- [ ] **Step 1: Append the helpers to `_shared/intervals.ts`**

Add at the end of `supabase/functions/_shared/intervals.ts`:

```ts
const STREAM_TYPES = 'time,heartrate,velocity_smooth,altitude,distance,latlng'

export async function getActivities(
  apiKey: string, athleteId: string, oldest: string, newest: string,
): Promise<any[]> {
  const res = await intervalsFetch(apiKey, `/athlete/${athleteId}/activities?oldest=${oldest}&newest=${newest}`)
  if (!res.ok) throw new Error(`activities fetch failed: ${res.status}`)
  return await res.json()
}

export async function getWellness(
  apiKey: string, athleteId: string, oldest: string, newest: string,
): Promise<any[]> {
  const res = await intervalsFetch(apiKey, `/athlete/${athleteId}/wellness?oldest=${oldest}&newest=${newest}`)
  if (!res.ok) throw new Error(`wellness fetch failed: ${res.status}`)
  return await res.json()
}

export async function getStreams(apiKey: string, activityId: string): Promise<any> {
  const res = await intervalsFetch(apiKey, `/activity/${activityId}/streams?types=${STREAM_TYPES}`)
  if (!res.ok) throw new Error(`streams fetch failed: ${res.status}`)
  return await res.json()
}
```

- [ ] **Step 2: Type-check**

Run: `deno check supabase/functions/_shared/intervals.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/intervals.ts
git commit -m "feat: Intervals.icu activities/wellness/streams fetch helpers"
```

---

### Task 4: `sync` edge function (recent + resumable backfill)

**Files:**
- Create: `supabase/functions/sync/index.ts`

**Interfaces:**
- Consumes: `adminClient`, `getCredentials`, `corsHeaders`, `jsonResponse`, `getActivities`, `getWellness`, `getStreams` (from `_shared/intervals.ts`); `mapActivity`, `mapWellness` (from `_shared/map.ts`).
- Produces: HTTP endpoint. Authed POST, body `{ mode: "recent" | "backfill" }`.
  - `recent` → `{ ok, mode:"recent", syncedActivities, syncedWellness, since }`
  - `backfill` → `{ ok, mode:"backfill", syncedActivities, oldestReached, done }`
  - On error → `{ ok:false, error, syncedActivities }` (HTTP 200 so the client can display the message), with progress persisted to `sync_state`.

- [ ] **Step 1: Implement the function**

Create `supabase/functions/sync/index.ts`:

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  adminClient, corsHeaders, getActivities, getCredentials, getStreams, getWellness, jsonResponse,
} from '../_shared/intervals.ts'
import { mapActivity, mapWellness } from '../_shared/map.ts'

const FIRST_SYNC_DAYS = 90
const BACKFILL_WINDOW_DAYS = 30
const STREAM_TYPES_TO_FETCH = new Set(['Run', 'Ride'])

const ymd = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86400000)

async function upsertActivities(admin: any, userId: string, acts: any[]) {
  if (acts.length === 0) return
  const rows = acts.map((a) => mapActivity(a, userId))
  const { error } = await admin.from('activities').upsert(rows)
  if (error) throw new Error(`upsert activities: ${error.message}`)
}

async function upsertWellness(admin: any, userId: string, days: any[]) {
  if (days.length === 0) return
  const rows = days.map((w) => mapWellness(w, userId))
  const { error } = await admin.from('wellness').upsert(rows)
  if (error) throw new Error(`upsert wellness: ${error.message}`)
}

// Fetch + store streams for Run/Ride that don't already have a streams row.
async function syncStreams(admin: any, apiKey: string, userId: string, acts: any[]) {
  const runRide = acts.filter((a) => STREAM_TYPES_TO_FETCH.has(a.type))
  if (runRide.length === 0) return
  const ids = runRide.map((a) => a.id)
  const { data: existing } = await admin.from('streams').select('activity_id').in('activity_id', ids)
  const have = new Set((existing ?? []).map((r: any) => r.activity_id))
  for (const a of runRide) {
    if (have.has(a.id)) continue
    const data = await getStreams(apiKey, a.id)
    const { error } = await admin.from('streams').upsert({ activity_id: a.id, user_id: userId, data })
    if (error) throw new Error(`upsert streams ${a.id}: ${error.message}`)
  }
}

async function setState(admin: any, userId: string, patch: Record<string, unknown>) {
  await admin.from('sync_state').upsert({ user_id: userId, updated_at: new Date().toISOString(), ...patch })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return jsonResponse({ ok: false, error: 'Unauthorized' }, 401)

  const admin = adminClient()
  let creds: { api_key: string; athlete_id: string }
  try { creds = await getCredentials(admin, user.id) } catch {
    return jsonResponse({ ok: false, error: 'Intervals.icu not connected' }, 400)
  }

  const { mode } = await req.json().catch(() => ({ mode: 'recent' }))
  const { data: state } = await admin.from('sync_state').select('*').eq('user_id', user.id).single()

  let syncedActivities = 0
  try {
    if (mode === 'backfill') {
      // Backfill requires a prior recent sync to establish the cursor.
      if (!state?.backfill_oldest_date) {
        return jsonResponse({ ok: false, error: 'Run Sync now first' }, 400)
      }
      const cursor = new Date(state.backfill_oldest_date + 'T00:00:00Z')
      const windowStart = addDays(cursor, -BACKFILL_WINDOW_DAYS)
      const acts = await getActivities(creds.api_key, creds.athlete_id, ymd(windowStart), ymd(cursor))
      const wells = await getWellness(creds.api_key, creds.athlete_id, ymd(windowStart), ymd(cursor))
      await upsertActivities(admin, user.id, acts)
      await upsertWellness(admin, user.id, wells)
      await syncStreams(admin, creds.api_key, user.id, acts)
      syncedActivities = acts.length
      const done = acts.length === 0
      await setState(admin, user.id, {
        backfill_oldest_date: ymd(windowStart), status: done ? 'backfill-complete' : 'ok',
        message: done ? 'Backfill complete' : `Backfilled to ${ymd(windowStart)} (${acts.length})`,
      })
      return jsonResponse({ ok: true, mode: 'backfill', syncedActivities, oldestReached: ymd(windowStart), done })
    }

    // recent
    const today = new Date()
    const since = state?.last_activity_date
      ? new Date(state.last_activity_date)
      : addDays(today, -FIRST_SYNC_DAYS)
    const acts = await getActivities(creds.api_key, creds.athlete_id, ymd(since), ymd(today))
    const wells = await getWellness(creds.api_key, creds.athlete_id, ymd(since), ymd(today))
    await upsertActivities(admin, user.id, acts)
    await upsertWellness(admin, user.id, wells)
    await syncStreams(admin, creds.api_key, user.id, acts)
    syncedActivities = acts.length

    const newest = acts.reduce<string | null>((m, a) => (a.start_date && (!m || a.start_date > m) ? a.start_date : m), null)
    const patch: Record<string, unknown> = {
      last_activity_date: newest ?? state?.last_activity_date ?? today.toISOString(),
      status: 'ok', message: `Synced ${acts.length} activities`,
    }
    if (!state?.backfill_oldest_date) patch.backfill_oldest_date = ymd(since)
    await setState(admin, user.id, patch)

    return jsonResponse({ ok: true, mode: 'recent', syncedActivities, syncedWellness: wells.length, since: ymd(since) })
  } catch (e) {
    await setState(admin, user.id, { status: 'error', message: String(e) })
    return jsonResponse({ ok: false, error: String(e), syncedActivities }, 200)
  }
})
```

- [ ] **Step 2: Type-check**

Run: `deno check supabase/functions/sync/index.ts`
Expected: no errors.

- [ ] **Step 3: Deploy**

Run: `supabase functions deploy sync`
Expected: "Deployed Functions on project …: sync".

- [ ] **Step 4: Live smoke test (real project + credentials are configured)**

Get a user JWT (from the app's logged-in session, or `supabase` auth), then:
`curl -s -X POST "$SUPABASE_URL/functions/v1/sync" -H "apikey: $ANON" -H "Authorization: Bearer <user-jwt>" -H "Content-Type: application/json" -d '{"mode":"recent"}'`
Expected: `{ "ok": true, "mode": "recent", "syncedActivities": <n>, ... }`. Then a `select count(*)` on `activities`/`wellness` (dashboard SQL editor) is non-zero, and `streams` has rows for runs.
If a live JWT is not available this session, mark this step deferred and rely on Step 2 type-check + Task 5's mocked test; note it in the report.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/sync/index.ts
git commit -m "feat: sync edge function with recent + resumable backfill"
```

---

### Task 5: Settings sync panel (frontend)

**Files:**
- Create: `src/components/SyncPanel.jsx`
- Test: `src/components/SyncPanel.test.jsx`
- Modify: `src/pages/Settings.jsx` (render `<SyncPanel />` below the connection section)

**Interfaces:**
- Consumes: `invokeFn(name, body)` from `src/lib/functions.js`.
- Produces: a panel with **Sync now** and **Sync older history** buttons; shows the latest result message; backfill auto-continues until `done` with a **Stop** control.

- [ ] **Step 1: Write the failing test**

Create `src/components/SyncPanel.test.jsx`:

```jsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import SyncPanel from './SyncPanel'
import * as fns from '../lib/functions'

test('Sync now calls sync(recent) and shows the result', async () => {
  const spy = vi.spyOn(fns, 'invokeFn').mockResolvedValue({ ok: true, mode: 'recent', syncedActivities: 3 })
  render(<SyncPanel />)
  fireEvent.click(screen.getByRole('button', { name: /Sync now/i }))
  await waitFor(() => expect(screen.getByText(/Synced 3/i)).toBeInTheDocument())
  expect(spy).toHaveBeenCalledWith('sync', { mode: 'recent' })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/components/SyncPanel.test.jsx`
Expected: FAIL ("Cannot find module './SyncPanel'").

- [ ] **Step 3: Implement the panel**

Create `src/components/SyncPanel.jsx`:

```jsx
import { useRef, useState } from 'react'
import { invokeFn } from '../lib/functions'

export default function SyncPanel() {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const stopRef = useRef(false)

  async function syncNow() {
    setBusy(true); setMsg(null)
    try {
      const r = await invokeFn('sync', { mode: 'recent' })
      setMsg(r.ok ? `Synced ${r.syncedActivities} activities` : `Error: ${r.error}`)
    } catch (e) {
      setMsg(`Error: ${e.message}`)
    } finally { setBusy(false) }
  }

  async function backfill() {
    setBusy(true); setMsg(null); stopRef.current = false
    try {
      let total = 0
      // Auto-continue batches until done or stopped.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const r = await invokeFn('sync', { mode: 'backfill' })
        if (!r.ok) { setMsg(`Error: ${r.error}`); break }
        total += r.syncedActivities
        setMsg(`Backfilling… ${total} activities (to ${r.oldestReached})`)
        if (r.done) { setMsg(`Backfill complete — ${total} activities`); break }
        if (stopRef.current) { setMsg(`Stopped — ${total} activities so far`); break }
      }
    } catch (e) {
      setMsg(`Error: ${e.message}`)
    } finally { setBusy(false) }
  }

  return (
    <section>
      <h3>Sync</h3>
      <button onClick={syncNow} disabled={busy}>Sync now</button>
      <button onClick={backfill} disabled={busy}>Sync older history</button>
      {busy && <button onClick={() => { stopRef.current = true }}>Stop</button>}
      {msg && <p>{msg}</p>}
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/components/SyncPanel.test.jsx`
Expected: PASS.

- [ ] **Step 5: Render it in Settings**

In `src/pages/Settings.jsx`, import `SyncPanel` and render `<SyncPanel />` immediately after the Intervals.icu `</section>` (only meaningful once connected, but harmless otherwise). Add `import SyncPanel from '../components/SyncPanel'` at the top.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all tests pass, output pristine.

- [ ] **Step 7: Commit**

```bash
git add src/components/SyncPanel.jsx src/components/SyncPanel.test.jsx src/pages/Settings.jsx
git commit -m "feat: Settings sync panel (sync now + resumable backfill)"
```

---

## Self-Review notes
- **Spec coverage:** schema for activities/streams/wellness/sync_state with RLS owner-read + service-role writes (Task 1); pure mappers with verified field names (Task 2); fetch helpers for the three endpoints (Task 3); `sync` function with `recent` (first 90 days / incremental) and bounded resumable `backfill`, idempotent upserts, graceful error persistence (Task 4); thin Settings sync UI with auto-continuing backfill + stop (Task 5). All spec items map to a task.
- **Tiered activity scope:** all types upserted as activity rows; streams fetched only for `Run`/`Ride` (`STREAM_TYPES_TO_FETCH`).
- **Type consistency:** `mapActivity`/`mapWellness` row shapes match the migration columns; `getActivities/getWellness/getStreams` signatures match their call sites in `sync`; `invokeFn('sync', { mode })` matches the function's body parsing and the test.
- **Out of scope confirmed absent:** no dashboard views, no best-efforts/PB capture, no zone/readiness computation.
- **Deferred-if-no-JWT:** Task 4 Step 4 live smoke test depends on a logged-in user JWT; type-check + Task 5 mocked test cover it otherwise.
