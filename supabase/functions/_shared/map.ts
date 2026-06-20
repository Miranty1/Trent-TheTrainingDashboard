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
