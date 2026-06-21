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
