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
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
