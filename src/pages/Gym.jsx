import { useEffect, useState } from 'react'
import { listGymSessions } from '../lib/data'
import { formatDuration, formatDate } from '../lib/format'

export default function Gym() {
  const [items, setItems] = useState(null)
  useEffect(() => {
    listGymSessions().then(setItems).catch(() => setItems([]))
  }, [])

  if (items === null) return <main><p>Loading…</p></main>

  return (
    <main>
      <h2>Gym</h2>
      {items.length === 0 ? (
        <p>No gym sessions yet.</p>
      ) : (
        <table className="splits">
          <thead>
            <tr><th>Date</th><th>Session</th><th>Duration</th><th>Avg HR</th><th>Max HR</th></tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id}>
                <td>{formatDate(a.start_date)}</td>
                <td>{a.name}</td>
                <td>{formatDuration(a.moving_time)}</td>
                <td>{a.average_heartrate ?? '—'}</td>
                <td>{a.max_heartrate ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
