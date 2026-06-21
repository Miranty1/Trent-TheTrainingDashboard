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

    const newest = acts.reduce<string | null>(
      (m, a) => (a.start_date && (!m || a.start_date > m) ? a.start_date : m), null)
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
