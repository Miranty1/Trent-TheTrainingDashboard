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
  assertEquals(row.gear, 'Pegasus') // object-or-string handled
  assertEquals(row.trainer, null)
  assertEquals(row.raw, a) // full payload retained
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
