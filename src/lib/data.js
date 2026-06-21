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
