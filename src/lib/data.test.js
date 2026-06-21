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
