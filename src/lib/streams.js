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
