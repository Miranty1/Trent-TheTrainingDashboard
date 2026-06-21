# Trent Slice 3 (Dashboard Views) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the Slice-2 synced data into three usable views — Overview (feed + weekly totals), Activity Detail (map + charts + splits), and Gym — establishing the app's first visual system and client data-access layer.

**Architecture:** Pure utility layers (`format.js`, `streams.js`) and a thin supabase query layer (`data.js`) feed React page components that read the RLS-protected tables directly with the user session (owner-SELECT — no edge functions for reads). Activity Detail draws GPS via Leaflet+OSM and stream charts via chart.js/react-chartjs-2; everything renders in a small dark-theme design system shared across the three views.

**Tech Stack:** React 19 + Vite, react-router-dom 7, supabase-js (anon/session reads), Leaflet + OpenStreetMap (maps), chart.js 4 + react-chartjs-2 (charts), vitest + Testing Library (tests). Existing patterns: `useState`/`useEffect` data loading as in `src/pages/Settings.jsx`; tests as in `src/App.test.jsx` / `src/components/SyncPanel.test.jsx`.

## Global Constraints

- **Reads only via the session client** (`src/lib/supabase.js`); owner-SELECT RLS auto-scopes rows to the user, so client queries must NOT filter by `user_id`.
- **Units: hardcode metric** — km, min/km pace (from `average_speed`/`velocity_smooth` in m/s), seconds→h:m:s, metres. All unit logic lives only in `src/lib/format.js` (the single seam for a future toggle).
- **Activity table is snake_case** (`start_date`, `moving_time`, `total_elevation_gain`, `average_speed`, `average_heartrate`, `max_heartrate`, `type`). Streams `data` is the raw Intervals array `[{ type, data: [...] }]` with stream types `time, heartrate, velocity_smooth, altitude, distance, latlng`.
- **Detail/full analytics only for `Run`/`Ride`**; `WeightTraining`/`Hike`/other render summary-only (no map/charts, no detail link).
- **Trends stays a stub** this slice (Slice 4). Do not build Trends, PBs, zones, or readiness.
- New deps added exactly where first used: `leaflet` + `react-chartjs-2` in Task 6.
- Every page handles loading / empty / not-found states explicitly — no blank screens.
- Test commands: `npm test` (vitest), `npm run lint` (eslint). Output must be pristine.

---

### Task 1: Metric formatting layer (`format.js`)

**Files:**
- Create: `src/lib/format.js`
- Test: `src/lib/format.test.js`

**Interfaces:**
- Produces (consumed by Tasks 5–7):
  - `formatDistance(meters: number|null): string` — e.g. `"15.0 km"`, `"—"` for null
  - `formatDuration(seconds: number|null): string` — `"1:39:14"` or `"39:14"`
  - `formatPace(speedMps: number|null): string` — `"6:37 /km"`, `"—"` for ≤0/null
  - `formatElevation(meters: number|null): string` — `"70 m"`
  - `formatDate(iso: string|null): string` — `"Jun 20, 2026"`

- [ ] **Step 1: Write the failing test**

Create `src/lib/format.test.js`:

```js
import { formatDistance, formatDuration, formatPace, formatElevation, formatDate } from './format'

test('formatDistance: metres → km, one decimal', () => {
  expect(formatDistance(15012.18)).toBe('15.0 km')
  expect(formatDistance(0)).toBe('0.0 km')
  expect(formatDistance(null)).toBe('—')
})

test('formatDuration: h:m:s with and without hours', () => {
  expect(formatDuration(5954)).toBe('1:39:14')
  expect(formatDuration(2354)).toBe('39:14')
  expect(formatDuration(null)).toBe('—')
})

test('formatPace: m/s → min/km, rounds seconds, handles 60', () => {
  expect(formatPace(2.519)).toBe('6:37 /km')
  expect(formatPace(0)).toBe('—')
  expect(formatPace(null)).toBe('—')
})

test('formatElevation: rounded metres', () => {
  expect(formatElevation(69.98)).toBe('70 m')
  expect(formatElevation(null)).toBe('—')
})

test('formatDate: short readable date', () => {
  expect(formatDate('2026-06-20T04:05:47Z')).toMatch(/2026/)
  expect(formatDate(null)).toBe('—')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/lib/format.test.js`
Expected: FAIL ("Cannot find module './format'").

- [ ] **Step 3: Implement the formatters**

Create `src/lib/format.js`:

```js
const pad = (n) => String(n).padStart(2, '0')
const isNil = (v) => v === null || v === undefined

export function formatDistance(meters) {
  if (isNil(meters)) return '—'
  return `${(meters / 1000).toFixed(1)} km`
}

export function formatDuration(seconds) {
  if (isNil(seconds)) return '—'
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

export function formatPace(speedMps) {
  if (isNil(speedMps) || speedMps <= 0) return '—'
  const secPerKm = 1000 / speedMps
  let m = Math.floor(secPerKm / 60)
  let s = Math.round(secPerKm % 60)
  if (s === 60) { m += 1; s = 0 }
  return `${m}:${pad(s)} /km`
}

export function formatElevation(meters) {
  if (isNil(meters)) return '—'
  return `${Math.round(meters)} m`
}

export function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/lib/format.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.js src/lib/format.test.js
git commit -m "feat: metric formatting layer for dashboard"
```

---

### Task 2: Stream parsing + per-km splits (`streams.js`)

**Files:**
- Create: `src/lib/streams.js`
- Test: `src/lib/streams.test.js`

**Interfaces:**
- Produces (consumed by Task 6):
  - `streamsByType(data: Array<{type,data}>|null): Record<string, number[]|number[][]>` — keys the raw Intervals stream array by `type`; `{}` for non-arrays.
  - `computeSplits(s: Record<string, any[]>): Array<{ km: number, seconds: number, avgHr: number|null }>` — full-km splits from `s.distance` (metres) + `s.time` (seconds), avg HR from `s.heartrate` when present.

- [ ] **Step 1: Write the failing test**

Create `src/lib/streams.test.js`:

```js
import { streamsByType, computeSplits } from './streams'

test('streamsByType keys the raw array by type; {} for non-array', () => {
  const raw = [{ type: 'time', data: [0, 1] }, { type: 'latlng', data: [[1, 2]] }]
  expect(streamsByType(raw)).toEqual({ time: [0, 1], latlng: [[1, 2]] })
  expect(streamsByType(null)).toEqual({})
})

test('computeSplits: one split per full km with elapsed time + avg HR', () => {
  // distance crosses 1000m at index 2 (t=300s) and 2000m at index 4 (t=620s)
  const s = {
    distance: [0, 600, 1000, 1600, 2000],
    time: [0, 180, 300, 480, 620],
    heartrate: [120, 130, 140, 150, 160],
  }
  const splits = computeSplits(s)
  expect(splits).toHaveLength(2)
  expect(splits[0]).toEqual({ km: 1, seconds: 300, avgHr: 133 })
  expect(splits[1]).toEqual({ km: 2, seconds: 320, avgHr: 153 })
})

test('computeSplits: empty when streams missing', () => {
  expect(computeSplits({})).toEqual([])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/lib/streams.test.js`
Expected: FAIL ("Cannot find module './streams'").

- [ ] **Step 3: Implement the helpers**

Create `src/lib/streams.js`:

```js
export function streamsByType(data) {
  const out = {}
  if (!Array.isArray(data)) return out
  for (const s of data) if (s && s.type) out[s.type] = s.data
  return out
}

const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length

// Full-km splits from cumulative distance (m) + elapsed time (s).
export function computeSplits(s) {
  const dist = s.distance
  const time = s.time
  const hr = s.heartrate
  if (!Array.isArray(dist) || !Array.isArray(time) || dist.length !== time.length) return []
  const splits = []
  let km = 1
  let startIdx = 0
  for (let i = 0; i < dist.length; i++) {
    if (dist[i] >= km * 1000) {
      const seconds = time[i] - time[startIdx]
      const avgHr = Array.isArray(hr) ? Math.round(mean(hr.slice(startIdx, i + 1))) : null
      splits.push({ km, seconds, avgHr })
      km += 1
      startIdx = i
    }
  }
  return splits
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/lib/streams.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/streams.js src/lib/streams.test.js
git commit -m "feat: stream parsing and per-km split computation"
```

---

### Task 3: Supabase read layer (`data.js`)

**Files:**
- Create: `src/lib/data.js`
- Test: `src/lib/data.test.js`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.js`.
- Produces (consumed by Tasks 5–7):
  - `listActivities({ types?: string[]|null, before?: string|null, after?: string|null, limit?: number }): Promise<Row[]>` — `start_date desc`; `before`→`.lt('start_date', before)`, `after`→`.gte('start_date', after)`, `types`→`.in('type', types)`.
  - `getActivity(id: string): Promise<Row|null>`
  - `getStreams(activityId: string): Promise<any[]|null>` — returns the `data` array or null.
  - `listGymSessions(limit?: number): Promise<Row[]>` — `type = 'WeightTraining'`, `start_date desc`.
  - `weeklyTotals(sinceIso: string): Promise<{distance,movingTime,elevation,count}>`
  - `sumTotals(rows: Row[]): {distance,movingTime,elevation,count}` — pure aggregation.

- [ ] **Step 1: Write the failing test**

Create `src/lib/data.test.js`:

```js
import { vi } from 'vitest'

// Chainable supabase mock that records calls and resolves to a fixed result.
vi.mock('./supabase', () => {
  const calls = {}
  const q = {}
  for (const m of ['select', 'order', 'limit', 'lt', 'gte', 'in', 'eq']) {
    q[m] = (...args) => { (calls[m] ||= []).push(args); return q }
  }
  q.maybeSingle = () => Promise.resolve({ data: { id: 'i1', data: [{ type: 'time', data: [0] }] }, error: null })
  q.then = (resolve) => resolve({ data: [], error: null })
  return { supabase: { from: () => q, _calls: calls } }
})

import { supabase } from './supabase'
import { listActivities, sumTotals } from './data'

test('listActivities applies type filter, before cursor, and limit', async () => {
  await listActivities({ types: ['Run'], before: '2026-06-01T00:00:00Z', limit: 10 })
  expect(supabase._calls.in.at(-1)).toEqual(['type', ['Run']])
  expect(supabase._calls.lt.at(-1)).toEqual(['start_date', '2026-06-01T00:00:00Z'])
  expect(supabase._calls.limit.at(-1)).toEqual([10])
})

test('sumTotals aggregates distance, moving time, elevation, count', () => {
  const rows = [
    { distance: 1000, moving_time: 300, total_elevation_gain: 10 },
    { distance: 2000, moving_time: 600, total_elevation_gain: 5 },
    { distance: null, moving_time: null, total_elevation_gain: null },
  ]
  expect(sumTotals(rows)).toEqual({ distance: 3000, movingTime: 900, elevation: 15, count: 3 })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/lib/data.test.js`
Expected: FAIL ("Cannot find module './data'").

- [ ] **Step 3: Implement the read layer**

Create `src/lib/data.js`:

```js
import { supabase } from './supabase'

export async function listActivities({ types = null, before = null, after = null, limit = 25 } = {}) {
  let q = supabase.from('activities').select('*').order('start_date', { ascending: false }).limit(limit)
  if (types && types.length) q = q.in('type', types)
  if (before) q = q.lt('start_date', before)
  if (after) q = q.gte('start_date', after)
  const { data, error } = await q
  if (error) throw error
  return data
}

export async function getActivity(id) {
  const { data, error } = await supabase.from('activities').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function getStreams(activityId) {
  const { data, error } = await supabase.from('streams').select('data').eq('activity_id', activityId).maybeSingle()
  if (error) throw error
  return data?.data ?? null
}

export async function listGymSessions(limit = 100) {
  const { data, error } = await supabase
    .from('activities').select('*').eq('type', 'WeightTraining')
    .order('start_date', { ascending: false }).limit(limit)
  if (error) throw error
  return data
}

export function sumTotals(rows) {
  return (rows ?? []).reduce(
    (t, a) => ({
      distance: t.distance + (a.distance || 0),
      movingTime: t.movingTime + (a.moving_time || 0),
      elevation: t.elevation + (a.total_elevation_gain || 0),
      count: t.count + 1,
    }),
    { distance: 0, movingTime: 0, elevation: 0, count: 0 },
  )
}

export async function weeklyTotals(sinceIso) {
  const { data, error } = await supabase
    .from('activities').select('distance,moving_time,total_elevation_gain')
    .gte('start_date', sinceIso)
  if (error) throw error
  return sumTotals(data)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/lib/data.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data.js src/lib/data.test.js
git commit -m "feat: supabase read layer for dashboard views"
```

---

### Task 4: Design system + shared cards (`index.css`, `MetricCard`, `ActivityCard`, styled `NavBar`)

**Invoke the `frontend-design` skill during this task** to elevate the baseline CSS below into a distinctive, polished dark theme (typography scale, color, spacing, card depth). The CSS here is a working baseline so the task is complete even before that pass; keep the class names stable since later tasks depend on them.

**Files:**
- Modify: `src/index.css`
- Create: `src/components/MetricCard.jsx`, `src/components/MetricCard.test.jsx`
- Create: `src/components/ActivityCard.jsx`, `src/components/ActivityCard.test.jsx`
- Modify: `src/components/NavBar.jsx` (no structural change — styled via `index.css`)

**Interfaces:**
- Produces (consumed by Tasks 5–7):
  - `<MetricCard label={string} value={string} />`
  - `<ActivityCard activity={Row} />` — renders a card; wraps it in a `<Link to={"/activity/:id"}>` only for `Run`/`Ride`.
  - CSS classes: `.metric-row`, `.metric-card`, `.activity-card`, `.filters`, `.load-more`, `.splits`, `.map`, `.chart`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/MetricCard.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import MetricCard from './MetricCard'

test('MetricCard renders label and value', () => {
  render(<MetricCard label="Distance" value="15.0 km" />)
  expect(screen.getByText('Distance')).toBeInTheDocument()
  expect(screen.getByText('15.0 km')).toBeInTheDocument()
})
```

Create `src/components/ActivityCard.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ActivityCard from './ActivityCard'

const run = { id: 'i1', type: 'Run', name: 'Morning Run', start_date: '2026-06-20T04:05:47Z', distance: 5000, moving_time: 1500, average_speed: 3.3 }
const gym = { id: 'i2', type: 'WeightTraining', name: 'Push Day', start_date: '2026-06-19T18:00:00Z', moving_time: 3600, average_heartrate: 110 }

test('Run card links to its detail page', () => {
  render(<MemoryRouter><ActivityCard activity={run} /></MemoryRouter>)
  expect(screen.getByText('Morning Run').closest('a')).toHaveAttribute('href', '/activity/i1')
})

test('Gym card is summary-only with no detail link', () => {
  render(<MemoryRouter><ActivityCard activity={gym} /></MemoryRouter>)
  expect(screen.getByText('Push Day').closest('a')).toBeNull()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test src/components/MetricCard.test.jsx src/components/ActivityCard.test.jsx`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `MetricCard`**

Create `src/components/MetricCard.jsx`:

```jsx
export default function MetricCard({ label, value }) {
  return (
    <div className="metric-card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  )
}
```

- [ ] **Step 4: Implement `ActivityCard`**

Create `src/components/ActivityCard.jsx`:

```jsx
import { Link } from 'react-router-dom'
import { formatDistance, formatDuration, formatPace, formatDate } from '../lib/format'

const ICONS = { Run: '🏃', Ride: '🚴', WeightTraining: '🏋️', Hike: '🥾' }
const DETAIL_TYPES = new Set(['Run', 'Ride'])

export default function ActivityCard({ activity: a }) {
  const icon = ICONS[a.type] ?? '•'
  const stats = a.type === 'WeightTraining'
    ? [formatDuration(a.moving_time), a.average_heartrate ? `${a.average_heartrate} bpm` : null]
    : [formatDistance(a.distance), formatDuration(a.moving_time), formatPace(a.average_speed)]
  const inner = (
    <div className="activity-card">
      <div className="icon">{icon}</div>
      <div className="body">
        <div className="name">{a.name}</div>
        <div className="meta">{formatDate(a.start_date)}</div>
      </div>
      <div className="stats">
        {stats.filter(Boolean).map((s, i) => <span key={i}>{s}</span>)}
      </div>
    </div>
  )
  return DETAIL_TYPES.has(a.type) ? <Link to={`/activity/${a.id}`}>{inner}</Link> : inner
}
```

- [ ] **Step 5: Write the design-system CSS**

Replace the contents of `src/index.css` with:

```css
:root {
  --bg: #0e1116;
  --surface: #171b22;
  --surface-2: #1f242d;
  --border: #2a313c;
  --text: #e6e9ef;
  --muted: #9aa4b2;
  --accent: #fc5200;
  --green: #3fb950;
  --radius: 12px;
  --gap: 16px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); }
main { max-width: 880px; margin: 0 auto; padding: 24px 16px 64px; }
a { color: inherit; text-decoration: none; }
h2 { font-weight: 600; margin: 0 0 12px; }
h4 { margin: 0 0 8px; color: var(--muted); font-weight: 500; }
.meta { color: var(--muted); font-size: 13px; }

nav { display: flex; gap: 8px; padding: 12px 16px; background: var(--surface);
  border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 10; }
nav a { padding: 8px 12px; border-radius: 8px; color: var(--muted); font-weight: 500; }
nav a.active { color: var(--text); background: var(--surface-2); }

.metric-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--gap); margin-bottom: 24px; }
.metric-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; }
.metric-card .label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
.metric-card .value { font-size: 24px; font-weight: 600; margin-top: 6px; }

.activity-card { display: flex; gap: 14px; align-items: center; background: var(--surface);
  border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; margin-bottom: 12px; }
.activity-card:hover { border-color: var(--accent); }
.activity-card .icon { font-size: 22px; width: 36px; text-align: center; }
.activity-card .body { flex: 1; min-width: 0; }
.activity-card .name { font-weight: 600; }
.activity-card .stats { display: flex; gap: 16px; font-size: 14px; }

.filters { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
.filters button { background: var(--surface); color: var(--muted); border: 1px solid var(--border);
  border-radius: 999px; padding: 6px 12px; cursor: pointer; }
.filters button.active { color: var(--text); border-color: var(--accent); }
.filters input[type="date"] { background: var(--surface); color: var(--text);
  border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; }

.load-more { display: block; margin: 16px auto 0; background: var(--surface-2); color: var(--text);
  border: 1px solid var(--border); border-radius: 8px; padding: 10px 16px; cursor: pointer; }

table.splits { width: 100%; border-collapse: collapse; font-size: 14px; }
table.splits th, table.splits td { text-align: left; padding: 8px; border-bottom: 1px solid var(--border); }
table.splits th { color: var(--muted); font-weight: 500; }

.map { height: 280px; border-radius: var(--radius); overflow: hidden; margin: 16px 0; }
.chart { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 12px; margin-bottom: 16px; }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test src/components/MetricCard.test.jsx src/components/ActivityCard.test.jsx`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add src/index.css src/components/MetricCard.jsx src/components/MetricCard.test.jsx src/components/ActivityCard.jsx src/components/ActivityCard.test.jsx
git commit -m "feat: dashboard design system, MetricCard and ActivityCard"
```

---

### Task 5: Overview page (weekly totals + feed + filters + load more)

**Files:**
- Create: `src/pages/Overview.jsx`, `src/pages/Overview.test.jsx`
- Modify: `src/pages/stubs.jsx` (remove `Overview`), `src/App.jsx` (import real `Overview`)

**Interfaces:**
- Consumes: `listActivities`, `weeklyTotals` (Task 3); `MetricCard`, `ActivityCard` (Task 4); `formatDistance`/`formatDuration`/`formatElevation` (Task 1).
- Produces: route element for `/`.

- [ ] **Step 1: Write the failing test**

Create `src/pages/Overview.test.jsx`:

```jsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import Overview from './Overview'
import * as data from '../lib/data'

const page1 = Array.from({ length: 25 }, (_, i) => ({
  id: `r${i}`, type: 'Run', name: `Run ${i}`, start_date: `2026-06-${String(20 - (i % 20) + 1).padStart(2, '0')}T08:00:00Z`,
  distance: 5000, moving_time: 1500, average_speed: 3.3,
}))

test('renders weekly totals and the activity feed', async () => {
  vi.spyOn(data, 'weeklyTotals').mockResolvedValue({ distance: 12000, movingTime: 3600, elevation: 80, count: 2 })
  vi.spyOn(data, 'listActivities').mockResolvedValue(page1)
  render(<MemoryRouter><Overview /></MemoryRouter>)
  await waitFor(() => expect(screen.getByText('12.0 km')).toBeInTheDocument())
  expect(screen.getByText('Run 0')).toBeInTheDocument()
})

test('Load more fetches the next page with a before cursor', async () => {
  vi.spyOn(data, 'weeklyTotals').mockResolvedValue({ distance: 0, movingTime: 0, elevation: 0, count: 0 })
  const spy = vi.spyOn(data, 'listActivities').mockResolvedValue(page1)
  render(<MemoryRouter><Overview /></MemoryRouter>)
  await waitFor(() => expect(screen.getByText('Run 0')).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: /Load more/i }))
  await waitFor(() => expect(spy).toHaveBeenCalledTimes(2))
  expect(spy.mock.calls[1][0]).toHaveProperty('before')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/pages/Overview.test.jsx`
Expected: FAIL ("Cannot find module './Overview'").

- [ ] **Step 3: Implement the page**

Create `src/pages/Overview.jsx`:

```jsx
import { useEffect, useState } from 'react'
import MetricCard from '../components/MetricCard'
import ActivityCard from '../components/ActivityCard'
import { listActivities, weeklyTotals } from '../lib/data'
import { formatDistance, formatDuration, formatElevation } from '../lib/format'

const TYPES = ['Run', 'Ride', 'WeightTraining', 'Hike']
const PAGE = 25

function startOfWeekIso() {
  const d = new Date()
  const monIdx = (d.getDay() + 6) % 7 // Monday = 0
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - monIdx)
  return d.toISOString()
}

export default function Overview() {
  const [totals, setTotals] = useState(null)
  const [items, setItems] = useState([])
  const [type, setType] = useState(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [done, setDone] = useState(false)

  const after = from ? new Date(from).toISOString() : null
  const beforeBound = to ? new Date(`${to}T23:59:59`).toISOString() : null

  useEffect(() => {
    weeklyTotals(startOfWeekIso()).then(setTotals).catch(() => setTotals(null))
  }, [])

  useEffect(() => {
    setLoading(true)
    setDone(false)
    listActivities({ types: type ? [type] : null, before: beforeBound, after, limit: PAGE })
      .then((rows) => { setItems(rows); setDone(rows.length < PAGE) })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [type, from, to]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadMore() {
    const before = items[items.length - 1]?.start_date
    const rows = await listActivities({ types: type ? [type] : null, before, after, limit: PAGE })
    setItems((prev) => [...prev, ...rows])
    if (rows.length < PAGE) setDone(true)
  }

  return (
    <main>
      <h2>This week</h2>
      <div className="metric-row">
        <MetricCard label="Distance" value={formatDistance(totals?.distance ?? 0)} />
        <MetricCard label="Time" value={formatDuration(totals?.movingTime ?? 0)} />
        <MetricCard label="Elevation" value={formatElevation(totals?.elevation ?? 0)} />
      </div>

      <div className="filters">
        <button className={!type ? 'active' : ''} onClick={() => setType(null)}>All</button>
        {TYPES.map((t) => (
          <button key={t} className={type === t ? 'active' : ''} onClick={() => setType(t)}>{t}</button>
        ))}
        <input type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : items.length === 0 ? (
        <p>No activities yet. Sync in Settings.</p>
      ) : (
        items.map((a) => <ActivityCard key={a.id} activity={a} />)
      )}

      {!loading && !done && items.length > 0 && (
        <button className="load-more" onClick={loadMore}>Load more</button>
      )}
    </main>
  )
}
```

- [ ] **Step 4: Wire the route**

In `src/pages/stubs.jsx`, delete the `Overview` export (keep `ActivityDetail`, `Trends`, `Gym` for now). In `src/App.jsx`, change the imports so `Overview` comes from `./pages/Overview` and the rest still come from `./pages/stubs`:

```jsx
import Overview from './pages/Overview'
import { ActivityDetail, Trends, Gym } from './pages/stubs'
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test src/pages/Overview.test.jsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/pages/Overview.jsx src/pages/Overview.test.jsx src/pages/stubs.jsx src/App.jsx
git commit -m "feat: Overview page with weekly totals, feed, filters, load more"
```

---

### Task 6: Activity Detail (map + stream charts + splits)

**Files:**
- Create: `src/components/RouteMap.jsx`, `src/components/StreamChart.jsx`
- Create: `src/pages/ActivityDetail.jsx`, `src/pages/ActivityDetail.test.jsx`
- Modify: `src/pages/stubs.jsx` (remove `ActivityDetail`), `src/App.jsx`, `package.json` (add `leaflet`, `react-chartjs-2`)

**Interfaces:**
- Consumes: `getActivity`, `getStreams` (Task 3); `streamsByType`, `computeSplits` (Task 2); formatters (Task 1); `MetricCard` (Task 4).
- Produces: route element for `/activity/:id`.
- `<RouteMap latlng={[[lat,lng], ...]} />`, `<StreamChart label color x={number[]} y={number[]} />`.

- [ ] **Step 1: Add dependencies**

Run: `npm install leaflet react-chartjs-2`
Expected: both added to `package.json` dependencies (chart.js is already present).

- [ ] **Step 2: Implement `RouteMap`**

Create `src/components/RouteMap.jsx`:

```jsx
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export default function RouteMap({ latlng }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current || !latlng?.length) return undefined
    const map = L.map(ref.current)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 19,
    }).addTo(map)
    const line = L.polyline(latlng, { color: '#fc5200', weight: 4 }).addTo(map)
    map.fitBounds(line.getBounds(), { padding: [20, 20] })
    return () => map.remove()
  }, [latlng])
  return <div className="map" ref={ref} />
}
```

- [ ] **Step 3: Implement `StreamChart`**

Create `src/components/StreamChart.jsx`:

```jsx
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS, LineElement, PointElement, LinearScale, CategoryScale, Tooltip,
} from 'chart.js'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip)

export default function StreamChart({ label, color, x, y }) {
  if (!y?.length) return null
  const data = {
    labels: x,
    datasets: [{ label, data: y, borderColor: color, pointRadius: 0, borderWidth: 2, tension: 0.3 }],
  }
  const options = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: { x: { display: false } },
  }
  return (
    <div className="chart">
      <h4>{label}</h4>
      <Line data={data} options={options} />
    </div>
  )
}
```

- [ ] **Step 4: Write the failing test**

Create `src/pages/ActivityDetail.test.jsx` (mock the map/chart components so jsdom doesn't run Leaflet/canvas):

```jsx
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi } from 'vitest'
import ActivityDetail from './ActivityDetail'
import * as data from '../lib/data'

vi.mock('../components/RouteMap', () => ({ default: () => <div data-testid="map" /> }))
vi.mock('../components/StreamChart', () => ({ default: ({ label }) => <div>{`chart:${label}`}</div> }))

function renderAt(id) {
  return render(
    <MemoryRouter initialEntries={[`/activity/${id}`]}>
      <Routes><Route path="/activity/:id" element={<ActivityDetail />} /></Routes>
    </MemoryRouter>,
  )
}

test('Run shows map, charts, and a splits table', async () => {
  vi.spyOn(data, 'getActivity').mockResolvedValue({ id: 'i1', type: 'Run', name: 'Long Run', start_date: '2026-06-20T04:05:47Z', distance: 2000, moving_time: 620, average_speed: 3.2 })
  vi.spyOn(data, 'getStreams').mockResolvedValue([
    { type: 'time', data: [0, 300, 620] },
    { type: 'distance', data: [0, 1000, 2000] },
    { type: 'heartrate', data: [120, 140, 160] },
    { type: 'latlng', data: [[1, 2], [1.1, 2.1]] },
  ])
  renderAt('i1')
  await waitFor(() => expect(screen.getByText('Long Run')).toBeInTheDocument())
  await waitFor(() => expect(screen.getByTestId('map')).toBeInTheDocument())
  expect(screen.getByText('chart:Heart rate')).toBeInTheDocument()
  expect(screen.getByRole('table')).toBeInTheDocument()
})

test('Gym activity is summary-only: no map, no streams fetch', async () => {
  vi.spyOn(data, 'getActivity').mockResolvedValue({ id: 'i2', type: 'WeightTraining', name: 'Push Day', start_date: '2026-06-19T18:00:00Z', moving_time: 3600, average_speed: null, distance: null })
  const streamsSpy = vi.spyOn(data, 'getStreams').mockResolvedValue(null)
  renderAt('i2')
  await waitFor(() => expect(screen.getByText('Push Day')).toBeInTheDocument())
  expect(screen.queryByTestId('map')).toBeNull()
  expect(streamsSpy).not.toHaveBeenCalled()
})
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npm test src/pages/ActivityDetail.test.jsx`
Expected: FAIL ("Cannot find module './ActivityDetail'").

- [ ] **Step 6: Implement the page**

Create `src/pages/ActivityDetail.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import RouteMap from '../components/RouteMap'
import StreamChart from '../components/StreamChart'
import MetricCard from '../components/MetricCard'
import { getActivity, getStreams } from '../lib/data'
import { streamsByType, computeSplits } from '../lib/streams'
import { formatDistance, formatDuration, formatPace, formatDate } from '../lib/format'

const FULL = new Set(['Run', 'Ride'])

export default function ActivityDetail() {
  const { id } = useParams()
  const [act, setAct] = useState(undefined) // undefined = loading, null = not found
  const [streams, setStreams] = useState(null)

  useEffect(() => {
    setAct(undefined)
    getActivity(id).then((a) => setAct(a ?? null)).catch(() => setAct(null))
  }, [id])

  useEffect(() => {
    if (act && FULL.has(act.type)) getStreams(id).then(setStreams).catch(() => setStreams(null))
  }, [act, id])

  if (act === undefined) return <main><p>Loading…</p></main>
  if (act === null) return <main><p>Activity not found.</p></main>

  const s = streamsByType(streams)
  const splits = computeSplits(s)

  return (
    <main>
      <h2>{act.name}</h2>
      <p className="meta">{formatDate(act.start_date)}</p>
      <div className="metric-row">
        <MetricCard label="Distance" value={formatDistance(act.distance)} />
        <MetricCard label="Time" value={formatDuration(act.moving_time)} />
        <MetricCard label="Pace" value={formatPace(act.average_speed)} />
      </div>

      {FULL.has(act.type) && (
        streams === null ? (
          <p>Loading activity data…</p>
        ) : (
          <>
            {s.latlng?.length ? <RouteMap latlng={s.latlng} /> : <p>No GPS data for this activity.</p>}
            <StreamChart label="Heart rate" color="#ef4444" x={s.time} y={s.heartrate} />
            <StreamChart label="Pace" color="#fc5200" x={s.time} y={s.velocity_smooth} />
            <StreamChart label="Elevation" color="#3fb950" x={s.time} y={s.altitude} />
            {splits.length > 0 && (
              <table className="splits">
                <thead><tr><th>Km</th><th>Time</th><th>Pace</th><th>HR</th></tr></thead>
                <tbody>
                  {splits.map((sp) => (
                    <tr key={sp.km}>
                      <td>{sp.km}</td>
                      <td>{formatDuration(sp.seconds)}</td>
                      <td>{formatPace(1000 / sp.seconds)}</td>
                      <td>{sp.avgHr ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )
      )}
    </main>
  )
}
```

Note: the "Loading activity data…" branch keys off `streams === null` (initial state). For a Run with a streams row this resolves to the array; if a run genuinely has no streams row, `getStreams` returns `null` and the page keeps showing that line — acceptable for v1 (streams are always synced for Run/Ride in Slice 2).

- [ ] **Step 7: Wire the route**

In `src/pages/stubs.jsx`, delete the `ActivityDetail` export. In `src/App.jsx`, update imports:

```jsx
import Overview from './pages/Overview'
import ActivityDetail from './pages/ActivityDetail'
import { Trends, Gym } from './pages/stubs'
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test src/pages/ActivityDetail.test.jsx`
Expected: PASS (2 tests).

- [ ] **Step 9: Commit**

```bash
git add src/components/RouteMap.jsx src/components/StreamChart.jsx src/pages/ActivityDetail.jsx src/pages/ActivityDetail.test.jsx src/pages/stubs.jsx src/App.jsx package.json package-lock.json
git commit -m "feat: Activity Detail with route map, stream charts, splits"
```

---

### Task 7: Gym page + final wiring & verification

**Files:**
- Create: `src/pages/Gym.jsx`, `src/pages/Gym.test.jsx`
- Modify: `src/pages/stubs.jsx` (now only `Trends` remains), `src/App.jsx`

**Interfaces:**
- Consumes: `listGymSessions` (Task 3); `formatDuration`, `formatDate` (Task 1).
- Produces: route element for `/gym`.

- [ ] **Step 1: Write the failing test**

Create `src/pages/Gym.test.jsx`:

```jsx
import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import Gym from './Gym'
import * as data from '../lib/data'

test('lists gym sessions with duration and HR', async () => {
  vi.spyOn(data, 'listGymSessions').mockResolvedValue([
    { id: 'g1', name: 'Push Day', start_date: '2026-06-19T18:00:00Z', moving_time: 3600, average_heartrate: 110, max_heartrate: 150 },
  ])
  render(<Gym />)
  await waitFor(() => expect(screen.getByText('Push Day')).toBeInTheDocument())
  expect(screen.getByText('1:00:00')).toBeInTheDocument()
  expect(screen.getByText('110')).toBeInTheDocument()
})

test('shows empty state when there are no sessions', async () => {
  vi.spyOn(data, 'listGymSessions').mockResolvedValue([])
  render(<Gym />)
  await waitFor(() => expect(screen.getByText(/No gym sessions/i)).toBeInTheDocument())
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/pages/Gym.test.jsx`
Expected: FAIL ("Cannot find module './Gym'").

- [ ] **Step 3: Implement the page**

Create `src/pages/Gym.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { listGymSessions } from '../lib/data'
import { formatDuration, formatDate } from '../lib/format'

export default function Gym() {
  const [items, setItems] = useState(null)
  useEffect(() => {
    listGymSessions().then(setItems).catch(() => setItems([]))
  }, [])

  if (items === null) return <main><p>Loading…</p></main>

  return (
    <main>
      <h2>Gym</h2>
      {items.length === 0 ? (
        <p>No gym sessions yet.</p>
      ) : (
        <table className="splits">
          <thead>
            <tr><th>Date</th><th>Session</th><th>Duration</th><th>Avg HR</th><th>Max HR</th></tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id}>
                <td>{formatDate(a.start_date)}</td>
                <td>{a.name}</td>
                <td>{formatDuration(a.moving_time)}</td>
                <td>{a.average_heartrate ?? '—'}</td>
                <td>{a.max_heartrate ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
```

- [ ] **Step 4: Wire the route**

In `src/pages/stubs.jsx`, delete the `Gym` export (only `Trends` should remain). In `src/App.jsx`, update imports:

```jsx
import Overview from './pages/Overview'
import ActivityDetail from './pages/ActivityDetail'
import Gym from './pages/Gym'
import { Trends } from './pages/stubs'
```

- [ ] **Step 5: Run the full suite + lint**

Run: `npm test`
Expected: all tests pass (Slices 1–3), output pristine.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Manual verification (real synced data)**

Run: `npm run dev`, log in, and confirm:
1. Overview → weekly totals + activity feed render; type filters and date inputs re-query; Load more appends older activities.
2. Click a Run → map draws the route, HR/pace/elevation charts render, splits table populated.
3. Click into / view a Hike or Gym activity → summary-only, no map/charts.
4. Gym tab → WeightTraining sessions listed with duration + HR.

If no synced data exists yet, run **Sync now** in Settings first (Slice 2).

- [ ] **Step 7: Commit**

```bash
git add src/pages/Gym.jsx src/pages/Gym.test.jsx src/pages/stubs.jsx src/App.jsx
git commit -m "feat: Gym session list and final route wiring"
```

---

## Self-Review notes

- **Spec coverage:** Overview feed + weekly totals + type/date filters + load-more (Task 5); Activity Detail map + pace/HR/elevation charts + per-km splits + summary-only branch (Tasks 2/6); Gym list (Task 7); metric-only formatting seam (Task 1); first design system via frontend-design (Task 4). Reads go direct through the session client with owner-SELECT RLS — no new edge functions. All approved-scope items map to a task.
- **Out of scope confirmed absent:** Trends stays a stub; no PBs/best-efforts, no zone distributions, no readiness score, no units toggle/settings table, no webhook sync.
- **Type/name consistency:** `listActivities({types,before,after,limit})` signature matches its call sites in Overview and the data test; `streamsByType`/`computeSplits` outputs (`{time,distance,heartrate,latlng,...}`, `{km,seconds,avgHr}`) match ActivityDetail's usage; `MetricCard({label,value})` and `ActivityCard({activity})` props match all callers; CSS class names defined in Task 4 are the ones used in Tasks 5–7.
- **Placeholder scan:** every code step contains complete, runnable code; no TODO/TBD; tests include real assertions.
- **Test isolation:** Leaflet and chart.js never execute in jsdom — `RouteMap`/`StreamChart` are mocked in `ActivityDetail.test.jsx`; `data.js` uses a self-contained chainable supabase mock.
- **Known v1 simplification (noted in Task 6):** a Run with no streams row keeps showing "Loading activity data…"; acceptable because Slice 2 always syncs streams for Run/Ride.
```
