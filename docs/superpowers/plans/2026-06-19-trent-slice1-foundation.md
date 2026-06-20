# Trent Slice 1 (Foundation & Intervals.icu Connection) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Revised 2026-06-21:** Data source switched from Strava (OAuth) to Intervals.icu
> (API key). Tasks 1, 2, and 4 are unchanged; Tasks 3, 5, 6, 7, and 8 are rewritten.

**Goal:** Stand up the Trent PWA with Supabase magic-link app-login and a working, server-side Intervals.icu connection authenticated by a stored API key.

**Architecture:** Single-repo Vite/React PWA hosted on Vercel; Supabase provides Postgres, magic-link Auth, and Deno Edge Functions. The Intervals.icu API key + athlete ID live in a Supabase table (never the browser); all Intervals.icu calls go through Edge Functions that read the key via the service role and use HTTP Basic auth.

**Tech Stack:** React 18, Vite, react-router-dom v6, @supabase/supabase-js v2, vite-plugin-pwa, chart.js (installed, unused this slice), Supabase Edge Functions (Deno/TypeScript), Vercel.

## Global Constraints

- App name in UI/header, `package.json`, README, PWA manifest `name`, and `index.html` `<title>`: manifest `name` = "Trent — The Training Dashboard", `short_name` = "Trent"; page title = "Trent".
- Single user only: public signups disabled, one pre-provisioned user. No multi-user code paths.
- The Intervals.icu API key is stored server-side in Supabase only — never in `localStorage`/browser storage, and never returned to the browser in any API response.
- Intervals.icu auth: HTTP Basic, username literal `API_KEY`, password = the user's key. Base URL `https://intervals.icu/api/v1`.
- All Intervals.icu calls go through Edge Functions; the browser never holds the key.
- Frontend secrets limited to `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. The service-role key lives only in Edge Function env. There is no app-level Intervals.icu secret (the key is per-user data).
- Slice 1 scope only: nav routes other than `/login` and `/settings` are stubs.

---

### Task 1: Scaffold Vite + React app with Trent naming

**Files:**
- Create: `package.json`, `vite.config.js`, `index.html`, `src/main.jsx`, `src/App.jsx`, `.gitignore`, `.env.example`, `README.md`
- Create: `src/App.test.jsx`, `vitest.config.js`

**Interfaces:**
- Produces: a running Vite dev server and `npm test` (vitest + @testing-library/react) wired up. `App` default export renders the shell.

- [ ] **Step 1: Scaffold and install deps**

```bash
npm create vite@latest . -- --template react
npm install react-router-dom @supabase/supabase-js chart.js
npm install -D vite-plugin-pwa vitest @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Set Trent naming**

In `package.json` set `"name": "trent-the-training-dashboard"`.
In `index.html` set `<title>Trent</title>`.
Create `README.md`:

```markdown
# Trent — The Training Dashboard

A free, single-user fitness dashboard that pulls Strava data (synced from a COROS Pace 4) into Premium-style trends, personal bests, and training-load analytics.

## Setup
Copy `.env.example` to `.env` and fill in your Supabase project values, then `npm install` and `npm run dev`.
```

- [ ] **Step 3: Add env example and gitignore entries**

Create `.env.example`:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Ensure `.gitignore` contains `.env` and `node_modules` (Vite template includes these — verify).

- [ ] **Step 4: Configure vitest**

Create `vitest.config.js`:

```js
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', globals: true, setupFiles: './src/setupTests.js' },
})
```

Create `src/setupTests.js`:

```js
import '@testing-library/jest-dom'
```

Add to `package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 5: Write a failing smoke test for the app title**

Create `src/App.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

test('renders the Trent app shell', () => {
  render(<MemoryRouter><App /></MemoryRouter>)
  expect(screen.getByText(/Trent/i)).toBeInTheDocument()
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test`
Expected: FAIL (App still renders the Vite template, no "Trent" text, or import mismatch).

- [ ] **Step 7: Replace App with a minimal Trent shell**

Replace `src/App.jsx`:

```jsx
export default function App() {
  return <header><h1>Trent</h1></header>
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold Trent Vite/React app with test harness"
```

---

### Task 2: PWA manifest and service worker

**Files:**
- Modify: `vite.config.js`
- Create: `public/` icons placeholders (`pwa-192.png`, `pwa-512.png`)

**Interfaces:**
- Produces: an installable PWA; build emits a manifest with name "Trent — The Training Dashboard" / short_name "Trent".

- [ ] **Step 1: Configure vite-plugin-pwa**

Replace `vite.config.js`:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa-192.png', 'pwa-512.png'],
      manifest: {
        name: 'Trent — The Training Dashboard',
        short_name: 'Trent',
        start_url: '/',
        display: 'standalone',
        background_color: '#0b0f14',
        theme_color: '#0b0f14',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
})
```

- [ ] **Step 2: Add placeholder icons**

Place any 192×192 and 512×512 PNG at `public/pwa-192.png` and `public/pwa-512.png` (solid-color placeholders are fine for this slice).

- [ ] **Step 3: Verify build emits the manifest**

Run: `npm run build`
Expected: build succeeds; `dist/manifest.webmanifest` contains `"short_name":"Trent"`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add installable PWA manifest and service worker"
```

---

### Task 3: Supabase init and database migration (REVISED for Intervals.icu)

**Files:**
- Create: `supabase/config.toml` (via CLI), `supabase/migrations/0001_intervals_credentials.sql`
- Delete: any previously-created `supabase/migrations/0001_strava_tokens.sql` and `supabase/migrations/0002_oauth_state.sql` (obsolete Strava tables; never applied)

**Interfaces:**
- Produces: table `intervals_credentials` with RLS; consumed by Edge Functions in Tasks 5–6 (service role). The frontend never reads it directly.

> **Note:** an earlier run committed `0001_strava_tokens.sql` and `0002_oauth_state.sql`.
> Remove both and replace with the single migration below. Migrations were never applied
> to any database, so no drop-migration is needed.

- [ ] **Step 1: Ensure Supabase is initialised**

```bash
supabase init   # skip if supabase/config.toml already exists
```

- [ ] **Step 2: Remove obsolete Strava migrations**

```bash
git rm -f supabase/migrations/0001_strava_tokens.sql supabase/migrations/0002_oauth_state.sql
```

- [ ] **Step 3: Write the intervals_credentials migration**

Create `supabase/migrations/0001_intervals_credentials.sql`:

```sql
create table public.intervals_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  api_key text not null,
  athlete_id text not null,
  updated_at timestamptz not null default now()
);

alter table public.intervals_credentials enable row level security;
-- No policies: only the service role (Edge Functions) may read/write.
-- This keeps the api_key unreadable by the browser; connection status is
-- returned by an Edge Function, not by a client SELECT.
```

- [ ] **Step 4: Apply migration (DEFERRED if no Docker/linked project)**

Run: `supabase db push` (against the linked project) or `supabase start` + `supabase db reset` locally.
Expected: `intervals_credentials` created; `supabase db lint` reports no errors.
If neither Docker nor a linked project is available this session, skip applying and note it as deferred in the report.

- [ ] **Step 5: Document deferred manual setup and fix the README intro**

Update `README.md`: (a) fix the intro line that still says "pulls Strava data (synced from a COROS Pace 4)" → "pulls Intervals.icu data (COROS Pace 4 → Intervals.icu)"; (b) under "## Supabase setup (manual, later)" list: link project (`supabase link`), apply migrations (`supabase db push`), disable public signups in the dashboard, and add the single allowed user via Authentication → Users.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: replace Strava tables with intervals_credentials migration"
```

---

### Task 4: Frontend auth, app shell, and stub routes

**Files:**
- Create: `src/lib/supabase.js`, `src/auth/SessionProvider.jsx`, `src/auth/RequireAuth.jsx`, `src/pages/Login.jsx`, `src/pages/Settings.jsx`, `src/pages/stubs.jsx`, `src/components/NavBar.jsx`
- Modify: `src/App.jsx`, `src/main.jsx`
- Test: `src/auth/RequireAuth.test.jsx`

**Interfaces:**
- Consumes: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Produces: `supabase` client (default export of `src/lib/supabase.js`); `useSession()` hook returning `{ session, loading }`; `RequireAuth` wrapper redirecting to `/login` when unauthenticated.

- [ ] **Step 1: Create the supabase client**

Create `src/lib/supabase.js`:

```js
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)
```

- [ ] **Step 2: Create the session provider**

Create `src/auth/SessionProvider.jsx`:

```jsx
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const SessionContext = createContext({ session: null, loading: true })
export const useSession = () => useContext(SessionContext)

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  return (
    <SessionContext.Provider value={{ session, loading }}>
      {children}
    </SessionContext.Provider>
  )
}
```

- [ ] **Step 3: Write a failing test for RequireAuth redirect**

Create `src/auth/RequireAuth.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi } from 'vitest'
import RequireAuth from './RequireAuth'
import * as sessionMod from './SessionProvider'

test('redirects to /login when no session', () => {
  vi.spyOn(sessionMod, 'useSession').mockReturnValue({ session: null, loading: false })
  render(
    <MemoryRouter initialEntries={['/secret']}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/secret" element={<RequireAuth><div>Secret</div></RequireAuth>} />
      </Routes>
    </MemoryRouter>,
  )
  expect(screen.getByText('Login Page')).toBeInTheDocument()
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test src/auth/RequireAuth.test.jsx`
Expected: FAIL ("Cannot find module './RequireAuth'").

- [ ] **Step 5: Implement RequireAuth**

Create `src/auth/RequireAuth.jsx`:

```jsx
import { Navigate } from 'react-router-dom'
import { useSession } from './SessionProvider'

export default function RequireAuth({ children }) {
  const { session, loading } = useSession()
  if (loading) return <p>Loading…</p>
  if (!session) return <Navigate to="/login" replace />
  return children
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test src/auth/RequireAuth.test.jsx`
Expected: PASS.

- [ ] **Step 7: Build login page**

Create `src/pages/Login.jsx`:

```jsx
import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)

  async function sendLink(e) {
    e.preventDefault()
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <main>
      <h1>Trent</h1>
      {sent ? (
        <p>Check your email for a magic link.</p>
      ) : (
        <form onSubmit={sendLink}>
          <input type="email" value={email} required placeholder="you@example.com"
            onChange={(e) => setEmail(e.target.value)} />
          <button type="submit">Send magic link</button>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
    </main>
  )
}
```

- [ ] **Step 8: Build nav bar and stub pages**

Create `src/components/NavBar.jsx`:

```jsx
import { NavLink } from 'react-router-dom'

const links = [
  ['/', 'Overview'], ['/trends', 'Trends'], ['/gym', 'Gym'], ['/settings', 'Settings'],
]

export default function NavBar() {
  return (
    <nav>
      {links.map(([to, label]) => (
        <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>
      ))}
    </nav>
  )
}
```

Create `src/pages/stubs.jsx`:

```jsx
export const Overview = () => <main><h2>Overview</h2><p>Coming in a later slice.</p></main>
export const ActivityDetail = () => <main><h2>Activity</h2><p>Coming in a later slice.</p></main>
export const Trends = () => <main><h2>Trends</h2><p>Coming in a later slice.</p></main>
export const Gym = () => <main><h2>Gym</h2><p>Coming in a later slice.</p></main>
```

- [ ] **Step 9: Wire routes in App and providers in main**

Replace `src/App.jsx`:

```jsx
import { Routes, Route } from 'react-router-dom'
import RequireAuth from './auth/RequireAuth'
import NavBar from './components/NavBar'
import Login from './pages/Login'
import Settings from './pages/Settings'
import { Overview, ActivityDetail, Trends, Gym } from './pages/stubs'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth><><NavBar /><AppOutlet /></></RequireAuth>}>
        <Route path="/" element={<Overview />} />
        <Route path="/activity/:id" element={<ActivityDetail />} />
        <Route path="/trends" element={<Trends />} />
        <Route path="/gym" element={<Gym />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}

function AppOutlet() {
  const { Outlet } = require('react-router-dom')
  return <Outlet />
}
```

Note: replace the `AppOutlet` shim with a top-level `import { Outlet } from 'react-router-dom'` and use `<Outlet />` directly — written here inline only to keep the snippet self-contained; prefer the top-level import.

Replace `src/main.jsx`:

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { SessionProvider } from './auth/SessionProvider'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <App />
      </SessionProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
```

- [ ] **Step 10: Run tests and dev server**

Run: `npm test` (all pass) and `npm run dev` (visit `/`, confirm redirect to `/login`).
Expected: unauthenticated visit to `/` redirects to `/login`; magic link sends.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: magic-link auth, app shell, protected routes, and stubs"
```

---

### Task 5: Shared Intervals.icu helper (REVISED)

**Files:**
- Create: `supabase/functions/_shared/intervals.ts`
- Test: `supabase/functions/_shared/intervals.test.ts`

**Interfaces:**
- Produces:
  - `basicAuthHeader(apiKey): string` — returns `Basic <base64("API_KEY:" + apiKey)>`.
  - `intervalsFetch(apiKey, path): Promise<Response>` — GET `https://intervals.icu/api/v1{path}` with the Basic auth header.
  - `adminClient(): SupabaseClient` — service-role Supabase client.
  - `getCredentials(admin, userId): Promise<{ api_key, athlete_id }>` — throws if none.
- Consumed by Task 6 (`intervals-save-key`, `intervals-athlete`) and all future sync functions.

- [ ] **Step 1: Write the failing test (Deno)**

Create `supabase/functions/_shared/intervals.test.ts`:

```ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { basicAuthHeader } from './intervals.ts'

Deno.test('basicAuthHeader uses API_KEY username and base64-encodes the key', () => {
  // base64("API_KEY:secret") === "QVBJX0tFWTpzZWNyZXQ="
  assertEquals(basicAuthHeader('secret'), 'Basic QVBJX0tFWTpzZWNyZXQ=')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test supabase/functions/_shared/intervals.test.ts`
Expected: FAIL ("Module not found" / `basicAuthHeader` not exported).

- [ ] **Step 3: Implement the helper**

Create `supabase/functions/_shared/intervals.ts`:

```ts
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BASE_URL = 'https://intervals.icu/api/v1'

export function basicAuthHeader(apiKey: string): string {
  // Intervals.icu uses HTTP Basic auth: username is the literal "API_KEY",
  // password is the user's key.
  return `Basic ${btoa(`API_KEY:${apiKey}`)}`
}

export function intervalsFetch(apiKey: string, path: string): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: basicAuthHeader(apiKey) },
  })
}

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

export async function getCredentials(
  admin: SupabaseClient,
  userId: string,
): Promise<{ api_key: string; athlete_id: string }> {
  const { data, error } = await admin
    .from('intervals_credentials')
    .select('api_key, athlete_id')
    .eq('user_id', userId)
    .single()
  if (error || !data) throw new Error('No Intervals.icu credentials for user')
  return data
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test supabase/functions/_shared/intervals.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: shared Intervals.icu fetch helper (Basic auth)"
```

---

### Task 6: Intervals.icu Edge Functions (REVISED)

**Files:**
- Create: `supabase/functions/intervals-save-key/index.ts`, `supabase/functions/intervals-athlete/index.ts`

**Interfaces:**
- Consumes: `intervalsFetch`, `adminClient`, `getCredentials` from Task 5; `intervals_credentials` table from Task 3.
- Produces: HTTP endpoints.
  - `intervals-save-key` (authed POST, body `{ apiKey, athleteId }`): validates the key by calling `GET /athlete/{athleteId}`; on success upserts credentials and returns `{ ok: true, athlete }`; on a bad key returns `{ ok: false }` with a 400 and saves nothing.
  - `intervals-athlete` (authed GET): returns `{ connected: true, athlete }`, or `{ connected: false }` when no credentials exist.

> **Auth note:** both functions resolve the user from the caller's Supabase JWT via an
> anon client carrying the `Authorization` header. The api_key is read/written only by
> the service-role `adminClient` and is never sent back to the browser.

- [ ] **Step 1: Implement intervals-save-key**

Create `supabase/functions/intervals-save-key/index.ts`:

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { adminClient, intervalsFetch } from '../_shared/intervals.ts'

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { apiKey, athleteId } = await req.json()
  if (!apiKey || !athleteId) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing apiKey or athleteId' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  // Validate the credentials before persisting.
  const probe = await intervalsFetch(apiKey, `/athlete/${athleteId}`)
  if (!probe.ok) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid API key or athlete ID' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }
  const athlete = await probe.json()

  const admin = adminClient()
  const { error } = await admin.from('intervals_credentials').upsert({
    user_id: user.id,
    api_key: apiKey,
    athlete_id: String(athleteId),
    updated_at: new Date().toISOString(),
  })
  if (error) return new Response(`Save failed: ${error.message}`, { status: 500 })

  return new Response(JSON.stringify({ ok: true, athlete }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

- [ ] **Step 2: Implement intervals-athlete**

Create `supabase/functions/intervals-athlete/index.ts`:

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { adminClient, getCredentials, intervalsFetch } from '../_shared/intervals.ts'

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const admin = adminClient()
  let creds: { api_key: string; athlete_id: string }
  try {
    creds = await getCredentials(admin, user.id)
  } catch {
    return new Response(JSON.stringify({ connected: false }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const res = await intervalsFetch(creds.api_key, `/athlete/${creds.athlete_id}`)
  if (!res.ok) return new Response(`Intervals.icu error: ${res.status}`, { status: 502 })
  const athlete = await res.json()
  return new Response(JSON.stringify({ connected: true, athlete }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

- [ ] **Step 3: Serve locally (requires Docker/linked project — DEFER if unavailable)**

```bash
supabase functions serve --env-file supabase/functions/.env.local
```

The functions need `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
(auto-injected when deployed; provide via `--env-file` for local serve). No Intervals.icu
secret is needed — the key is supplied per-request/per-user.

- [ ] **Step 4: Smoke-test (when a project is available)**

With a valid user JWT:
`curl -X POST -H "Authorization: Bearer <jwt>" -H "Content-Type: application/json" -d '{"apiKey":"<key>","athleteId":"<id>"}' http://localhost:54321/functions/v1/intervals-save-key`
Expected: `{ "ok": true, "athlete": { ... } }`; an `intervals_credentials` row exists; a bad key returns `{ "ok": false }` with status 400.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: intervals-save-key and intervals-athlete edge functions"
```

---

### Task 7: Settings page wiring

**Files:**
- Create: `src/pages/Settings.jsx` (referenced by Task 4 routes), `src/lib/functions.js`
- Test: `src/pages/Settings.test.jsx`

**Interfaces:**
- Consumes: `supabase` client; the `intervals-save-key` and `intervals-athlete` Edge Functions from Task 6.
- Produces: Settings UI showing Intervals.icu connection status and an API key + athlete ID form (Connect/Reconnect).

- [ ] **Step 1: Add a function-invocation helper**

Create `src/lib/functions.js`:

```js
import { supabase } from './supabase'

export async function invokeFn(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) throw error
  return data
}
```

- [ ] **Step 2: Write a failing test for the disconnected state**

Create `src/pages/Settings.test.jsx`:

```jsx
import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import Settings from './Settings'
import * as fns from '../lib/functions'

test('shows Not connected and the key form when no credentials are stored', async () => {
  vi.spyOn(fns, 'invokeFn').mockResolvedValue({ connected: false })
  render(<Settings />)
  await waitFor(() => expect(screen.getByText(/Not connected/i)).toBeInTheDocument())
  expect(screen.getByLabelText(/API key/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/Athlete ID/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Connect Intervals\.icu/i })).toBeInTheDocument()
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test src/pages/Settings.test.jsx`
Expected: FAIL ("Cannot find module './Settings'").

- [ ] **Step 4: Implement Settings**

Create `src/pages/Settings.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { invokeFn } from '../lib/functions'

export default function Settings() {
  const [status, setStatus] = useState({ loading: true })
  const [apiKey, setApiKey] = useState('')
  const [athleteId, setAthleteId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function loadStatus() {
    invokeFn('intervals-athlete')
      .then((d) => setStatus({ loading: false, ...d }))
      .catch(() => setStatus({ loading: false, connected: false }))
  }

  useEffect(loadStatus, [])

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await invokeFn('intervals-save-key', { apiKey, athleteId })
      if (!res.ok) throw new Error(res.error || 'Could not validate credentials')
      setApiKey('')
      setStatus({ loading: false, connected: true, athlete: res.athlete })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (status.loading) return <main><h2>Settings</h2><p>Loading…</p></main>

  return (
    <main>
      <h2>Settings</h2>
      <section>
        <h3>Intervals.icu</h3>
        {status.connected ? (
          <p>Connected as {status.athlete?.name ?? status.athlete?.id}</p>
        ) : (
          <p>Not connected</p>
        )}
        <form onSubmit={save}>
          <label htmlFor="apiKey">API key</label>
          <input id="apiKey" type="password" value={apiKey} required
            onChange={(e) => setApiKey(e.target.value)} />
          <label htmlFor="athleteId">Athlete ID</label>
          <input id="athleteId" type="text" value={athleteId} required
            placeholder="i123456" onChange={(e) => setAthleteId(e.target.value)} />
          <button type="submit" disabled={saving}>
            {status.connected ? 'Reconnect Intervals.icu' : 'Connect Intervals.icu'}
          </button>
          {error && <p role="alert">{error}</p>}
        </form>
      </section>
    </main>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test src/pages/Settings.test.jsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: Settings page with Intervals.icu key entry and status"
```

---

### Task 8: Deployment and end-to-end verification (REVISED)

**Files:**
- Create: `vercel.json` (SPA rewrite)

**Interfaces:**
- Produces: live Vercel deployment + deployed Edge Functions. No third-party app config needed (no Strava app).

- [ ] **Step 1: Add SPA rewrite for client routing**

Create `vercel.json`:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

- [ ] **Step 2: Deploy backend**

```bash
supabase link --project-ref <ref>
supabase db push
supabase functions deploy intervals-save-key intervals-athlete
```

No `supabase secrets set` is required for the data source — the Intervals.icu API key is
per-user data stored in the DB, not an app secret.

- [ ] **Step 3: Deploy frontend**

Create the Vercel project from the repo; set env `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; deploy. Add the Vercel domain to the Supabase Auth redirect allowlist.

- [ ] **Step 4: Run acceptance checks**

1. Magic-link login on laptop and iPhone Safari; a non-provisioned email cannot sign in.
2. In Settings, enter API key + athlete ID → status shows "Connected as `<name>`". A bad key shows an error and saves nothing.
3. Confirm an `intervals_credentials` row exists and that no browser network response ever contains `api_key`.
4. Add the PWA to the iPhone home screen; confirm title/manifest read "Trent".

- [ ] **Step 5: Commit and open PR**

```bash
git add -A
git commit -m "chore: Vercel SPA rewrite and deploy config"
```

---

## Self-Review notes
- **Spec coverage:** app-login lockdown (Task 3 manual note + Task 4), Intervals.icu key stored server-side + never returned to browser (Task 3 RLS + Task 6), connection via Basic-auth helper (Task 5), Settings key-entry/status (Task 7), PWA naming (Tasks 1–2), acceptance tests (Task 8). All slice-1 spec items map to a task.
- **Out of scope confirmed absent:** no activity/wellness schema, no sync, no analytics, no readiness score — only stub routes.
- **Type consistency:** `basicAuthHeader(apiKey)`, `intervalsFetch(apiKey, path)`, `adminClient()`, `getCredentials(admin, userId)`, `invokeFn(name, body)`, and the `{ connected, athlete }` / `{ ok, athlete }` shapes are used identically across Tasks 5–7.
- **Known nit to fix during execution:** in Task 4 Step 9 use a top-level `import { Outlet } from 'react-router-dom'` instead of the inline `require` shim shown in the snippet.
- **Athlete display:** Intervals.icu athlete object field names are unverified; Settings renders `athlete.name ?? athlete.id`. Confirm the real field against a live response when a key is available.
