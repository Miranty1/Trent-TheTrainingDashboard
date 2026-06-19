# Trent Slice 1 (Foundation & Strava Connection) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Trent PWA with Supabase magic-link auth and a working, server-side Strava OAuth connection whose tokens refresh lazily.

**Architecture:** Single-repo Vite/React PWA hosted on Vercel; Supabase provides Postgres, magic-link Auth, and Deno Edge Functions. Strava OAuth runs through a stable Edge Function callback using a server-side nonce in the `state` param, so one registered Strava app works for both localhost and prod. Strava tokens live in a Supabase table (never the browser) and are refreshed on demand by a shared helper.

**Tech Stack:** React 18, Vite, react-router-dom v6, @supabase/supabase-js v2, vite-plugin-pwa, chart.js (installed, unused this slice), Supabase Edge Functions (Deno/TypeScript), Vercel.

## Global Constraints

- App name in UI/header, `package.json`, README, PWA manifest `name`, and `index.html` `<title>`: manifest `name` = "Trent — The Training Dashboard", `short_name` = "Trent"; page title = "Trent".
- Single user only: public signups disabled, one pre-provisioned user. No multi-user code paths.
- Strava tokens stored server-side in Supabase only — never in `localStorage`/browser storage.
- Strava OAuth scope: `read,activity:read_all`.
- One registered Strava app; callback domain = the Supabase Edge Functions domain.
- Token refresh is lazy (refresh when `expires_at` is within a 60s buffer), via the shared `getValidStravaToken` helper — no cron.
- Frontend secrets limited to `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Strava client secret and service-role key live only in Edge Function secrets.
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

### Task 3: Supabase init and database migrations

**Files:**
- Create: `supabase/config.toml` (via CLI), `supabase/migrations/0001_strava_tokens.sql`, `supabase/migrations/0002_oauth_state.sql`

**Interfaces:**
- Produces: tables `strava_tokens` and `oauth_state` with RLS; consumed by Edge Functions in Task 5 (service role) and the frontend session in Task 4.

- [ ] **Step 1: Init Supabase locally**

```bash
supabase init
```

- [ ] **Step 2: Write strava_tokens migration**

Create `supabase/migrations/0001_strava_tokens.sql`:

```sql
create table public.strava_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  athlete_id bigint,
  scope text,
  updated_at timestamptz not null default now()
);

alter table public.strava_tokens enable row level security;

create policy "owner reads own tokens"
  on public.strava_tokens for select
  using (auth.uid() = user_id);
-- writes happen only via Edge Functions using the service role, which bypasses RLS.
```

- [ ] **Step 3: Write oauth_state migration**

Create `supabase/migrations/0002_oauth_state.sql`:

```sql
create table public.oauth_state (
  nonce text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  frontend_origin text not null,
  expires_at timestamptz not null
);

alter table public.oauth_state enable row level security;
-- no policies: only the service role (Edge Functions) may read/write.
```

- [ ] **Step 4: Apply migrations**

Run: `supabase db push` (against the linked project) or `supabase start` + `supabase db reset` for local.
Expected: both tables created; `supabase db lint` reports no errors.

- [ ] **Step 5: Disable signups and pre-provision the user**

In the Supabase dashboard: Authentication → Providers/Settings → disable new signups. Authentication → Users → "Add user" with your single allowed email (send magic link or set as confirmed). Document this in `README.md` under a "Supabase setup" note.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add strava_tokens and oauth_state tables with RLS"
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

### Task 5: Shared Strava helper with lazy refresh

**Files:**
- Create: `supabase/functions/_shared/strava.ts`
- Test: `supabase/functions/_shared/strava.test.ts`

**Interfaces:**
- Produces: `getValidStravaToken(admin, userId): Promise<string>` — returns a non-expired access token, refreshing and persisting if `expires_at` is within 60s. Consumed by Tasks 6 (callback, athlete) and all future sync functions. `admin` is a service-role Supabase client.

- [ ] **Step 1: Write the failing test (Deno)**

Create `supabase/functions/_shared/strava.test.ts`:

```ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { needsRefresh } from './strava.ts'

Deno.test('needsRefresh true when within 60s buffer', () => {
  const soon = new Date(Date.now() + 30_000).toISOString()
  assertEquals(needsRefresh(soon), true)
})

Deno.test('needsRefresh false when comfortably in the future', () => {
  const later = new Date(Date.now() + 3_600_000).toISOString()
  assertEquals(needsRefresh(later), false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test supabase/functions/_shared/strava.test.ts`
Expected: FAIL ("Module not found" / `needsRefresh` not exported).

- [ ] **Step 3: Implement the helper**

Create `supabase/functions/_shared/strava.ts`:

```ts
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BUFFER_MS = 60_000

export function needsRefresh(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() - Date.now() <= BUFFER_MS
}

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

export async function getValidStravaToken(
  admin: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data, error } = await admin
    .from('strava_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .single()
  if (error || !data) throw new Error('No Strava tokens for user')

  if (!needsRefresh(data.expires_at)) return data.access_token

  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: Deno.env.get('STRAVA_CLIENT_ID'),
      client_secret: Deno.env.get('STRAVA_CLIENT_SECRET'),
      grant_type: 'refresh_token',
      refresh_token: data.refresh_token,
    }),
  })
  if (!res.ok) throw new Error(`Strava refresh failed: ${res.status}`)
  const t = await res.json()

  await admin.from('strava_tokens').update({
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: new Date(t.expires_at * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId)

  return t.access_token
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test supabase/functions/_shared/strava.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: shared Strava token helper with lazy refresh"
```

---

### Task 6: Strava OAuth Edge Functions

**Files:**
- Create: `supabase/functions/strava-oauth-start/index.ts`, `supabase/functions/strava-oauth-callback/index.ts`, `supabase/functions/strava-athlete/index.ts`

**Interfaces:**
- Consumes: `getValidStravaToken`, `adminClient` from Task 5; `oauth_state` and `strava_tokens` tables from Task 3.
- Produces: HTTP endpoints. `strava-oauth-start` (authed POST) returns `{ url }`. `strava-oauth-callback` (public GET) 302-redirects to `<origin>/settings?strava=connected`. `strava-athlete` (authed GET) returns the Strava `/athlete` JSON, or `{ connected: false }` when no tokens exist.

- [ ] **Step 1: Implement strava-oauth-start**

Create `supabase/functions/strava-oauth-start/index.ts`:

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { adminClient } from '../_shared/strava.ts'

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { origin } = await req.json() // frontend origin to return to
  const nonce = crypto.randomUUID()
  const admin = adminClient()
  await admin.from('oauth_state').insert({
    nonce,
    user_id: user.id,
    frontend_origin: origin,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  })

  const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/strava-oauth-callback`
  const url = new URL('https://www.strava.com/oauth/authorize')
  url.searchParams.set('client_id', Deno.env.get('STRAVA_CLIENT_ID')!)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'read,activity:read_all')
  url.searchParams.set('approval_prompt', 'auto')
  url.searchParams.set('state', nonce)

  return new Response(JSON.stringify({ url: url.toString() }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

- [ ] **Step 2: Implement strava-oauth-callback**

Create `supabase/functions/strava-oauth-callback/index.ts`:

```ts
import { adminClient } from '../_shared/strava.ts'

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const nonce = url.searchParams.get('state')
  if (!code || !nonce) return new Response('Missing code/state', { status: 400 })

  const admin = adminClient()
  const { data: state } = await admin
    .from('oauth_state').select('*').eq('nonce', nonce).single()
  if (!state || new Date(state.expires_at) < new Date()) {
    return new Response('Invalid or expired state', { status: 400 })
  }
  await admin.from('oauth_state').delete().eq('nonce', nonce)

  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: Deno.env.get('STRAVA_CLIENT_ID'),
      client_secret: Deno.env.get('STRAVA_CLIENT_SECRET'),
      code,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) return new Response(`Token exchange failed: ${res.status}`, { status: 502 })
  const t = await res.json()

  await admin.from('strava_tokens').upsert({
    user_id: state.user_id,
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: new Date(t.expires_at * 1000).toISOString(),
    athlete_id: t.athlete?.id ?? null,
    scope: 'read,activity:read_all',
    updated_at: new Date().toISOString(),
  })

  return new Response(null, {
    status: 302,
    headers: { Location: `${state.frontend_origin}/settings?strava=connected` },
  })
})
```

- [ ] **Step 3: Implement strava-athlete**

Create `supabase/functions/strava-athlete/index.ts`:

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { adminClient, getValidStravaToken } from '../_shared/strava.ts'

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
  let token: string
  try {
    token = await getValidStravaToken(admin, user.id)
  } catch {
    return new Response(JSON.stringify({ connected: false }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const res = await fetch('https://www.strava.com/api/v3/athlete', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return new Response(`Strava error: ${res.status}`, { status: 502 })
  const athlete = await res.json()
  return new Response(JSON.stringify({ connected: true, athlete }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

- [ ] **Step 4: Set function secrets and deploy locally**

```bash
supabase secrets set STRAVA_CLIENT_ID=... STRAVA_CLIENT_SECRET=...
supabase functions serve
```

Note: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically into deployed functions; for `supabase functions serve` provide them via `--env-file`.

- [ ] **Step 5: Smoke-test start endpoint**

Run (with a valid user JWT): `curl -X POST -H "Authorization: Bearer <jwt>" -H "Content-Type: application/json" -d '{"origin":"http://localhost:5173"}' http://localhost:54321/functions/v1/strava-oauth-start`
Expected: JSON `{ "url": "https://www.strava.com/oauth/authorize?...state=..." }`; an `oauth_state` row exists.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: Strava OAuth start/callback and athlete edge functions"
```

---

### Task 7: Settings page wiring

**Files:**
- Create: `src/pages/Settings.jsx` (referenced by Task 4 routes), `src/lib/functions.js`
- Test: `src/pages/Settings.test.jsx`

**Interfaces:**
- Consumes: `supabase` client; the three Edge Functions from Task 6.
- Produces: Settings UI showing connection status and a Connect/Reconnect button.

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

test('shows Not connected when athlete fn reports disconnected', async () => {
  vi.spyOn(fns, 'invokeFn').mockResolvedValue({ connected: false })
  render(<Settings />)
  await waitFor(() => expect(screen.getByText(/Not connected/i)).toBeInTheDocument())
  expect(screen.getByRole('button', { name: /Connect Strava/i })).toBeInTheDocument()
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

  useEffect(() => {
    invokeFn('strava-athlete')
      .then((d) => setStatus({ loading: false, ...d }))
      .catch(() => setStatus({ loading: false, connected: false }))
  }, [])

  async function connect() {
    const { url } = await invokeFn('strava-oauth-start', { origin: window.location.origin })
    window.location.href = url
  }

  if (status.loading) return <main><h2>Settings</h2><p>Loading…</p></main>

  return (
    <main>
      <h2>Settings</h2>
      <section>
        <h3>Strava</h3>
        {status.connected ? (
          <p>
            Connected as {status.athlete?.firstname} {status.athlete?.lastname}
            {status.athlete?.profile && (
              <img src={status.athlete.profile} alt="" width={32} height={32} />
            )}
          </p>
        ) : (
          <p>Not connected</p>
        )}
        <button onClick={connect}>
          {status.connected ? 'Reconnect Strava' : 'Connect Strava'}
        </button>
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
git commit -m "feat: Settings page with Strava connect/status"
```

---

### Task 8: Deployment and end-to-end verification

**Files:**
- Create: `vercel.json` (SPA rewrite)

**Interfaces:**
- Produces: live Vercel deployment + deployed Edge Functions + configured Strava app.

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
supabase functions deploy strava-oauth-start strava-oauth-callback strava-athlete
supabase secrets set STRAVA_CLIENT_ID=... STRAVA_CLIENT_SECRET=...
```

- [ ] **Step 3: Configure Strava app**

In the Strava API settings, set "Authorization Callback Domain" to the Supabase functions host (e.g. `<ref>.supabase.co`).

- [ ] **Step 4: Deploy frontend**

Create the Vercel project from the repo; set env `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; deploy. Add the Vercel domain to Supabase Auth redirect allowlist.

- [ ] **Step 5: Run acceptance checks**

1. Magic-link login on laptop and iPhone Safari; a non-provisioned email cannot sign in.
2. Click Connect Strava → through `strava-oauth-callback` → back to Settings showing "Connected as `<name>`".
3. In the DB, set `strava_tokens.expires_at` to the past, reload Settings → athlete still loads (refresh path) and the row's `expires_at`/`updated_at` advanced.
4. Add the PWA to the iPhone home screen; confirm title/manifest read "Trent".

- [ ] **Step 6: Commit and open PR**

```bash
git add -A
git commit -m "chore: Vercel SPA rewrite and deploy config"
```

---

## Self-Review notes
- **Spec coverage:** auth lockdown (Task 3 step 5 + Task 4), Edge-Function OAuth with nonce state (Tasks 5–6), server-side tokens + lazy refresh (Task 5), Settings status/connect (Task 7), PWA naming (Tasks 1–2), localhost+prod single Strava app (Task 6 redirect + Task 8 callback domain), acceptance tests (Task 8). All slice-1 spec items map to a task.
- **Out of scope confirmed absent:** no activity/stream schema, no sync, no analytics — only stub routes.
- **Type consistency:** `getValidStravaToken(admin, userId)`, `needsRefresh(expiresAt)`, `adminClient()`, `invokeFn(name, body)`, and the `{ connected, athlete }` shape are used identically across Tasks 5–7.
- **Known nit to fix during execution:** in Task 4 Step 9 use a top-level `import { Outlet } from 'react-router-dom'` instead of the inline `require` shim shown in the snippet.
