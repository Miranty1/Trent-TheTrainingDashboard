import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import RouteMap from '../components/RouteMap'
import StreamChart from '../components/StreamChart'
import MetricCard from '../components/MetricCard'
import { getActivity, getStreams } from '../lib/data'
import { streamsByType, computeSplits } from '../lib/streams'
import { formatDistance, formatDuration, formatPace, formatDate } from '../lib/format'

const FULL = new Set(['Run', 'Ride'])

export default function ActivityDetail() {
  const { id } = useParams()
  const [act, setAct] = useState(undefined) // undefined = loading, null = not found
  const [streams, setStreams] = useState(null)

  useEffect(() => {
    let active = true
    getActivity(id)
      .then((a) => { if (active) setAct(a ?? null) })
      .catch(() => { if (active) setAct(null) })
    return () => { active = false }
  }, [id])

  useEffect(() => {
    if (act && FULL.has(act.type)) getStreams(id).then(setStreams).catch(() => setStreams(null))
  }, [act, id])

  if (act === undefined) return <main><p>Loading…</p></main>
  if (act === null) return <main><p>Activity not found.</p></main>

  const s = streamsByType(streams)
  const splits = computeSplits(s)

  return (
    <main>
      <h2>{act.name}</h2>
      <p className="meta">{formatDate(act.start_date)}</p>
      <div className="metric-row">
        <MetricCard label="Distance" value={formatDistance(act.distance)} />
        <MetricCard label="Time" value={formatDuration(act.moving_time)} />
        <MetricCard label="Pace" value={formatPace(act.average_speed)} />
      </div>

      {FULL.has(act.type) && (
        streams === null ? (
          <p>Loading activity data…</p>
        ) : (
          <>
            {s.latlng?.length ? <RouteMap latlng={s.latlng} /> : <p>No GPS data for this activity.</p>}
            <StreamChart label="Heart rate" color="#ef4444" x={s.time} y={s.heartrate} />
            <StreamChart label="Pace" color="#fc5200" x={s.time} y={s.velocity_smooth} />
            <StreamChart label="Elevation" color="#3fb950" x={s.time} y={s.altitude} />
            {splits.length > 0 && (
              <table className="splits">
                <thead><tr><th>Km</th><th>Time</th><th>Pace</th><th>HR</th></tr></thead>
                <tbody>
                  {splits.map((sp) => (
                    <tr key={sp.km}>
                      <td>{sp.km}</td>
                      <td>{formatDuration(sp.seconds)}</td>
                      <td>{formatPace(1000 / sp.seconds)}</td>
                      <td>{sp.avgHr ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )
      )}
    </main>
  )
}
