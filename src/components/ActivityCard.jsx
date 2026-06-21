import { Link } from 'react-router-dom'
import { formatDistance, formatDuration, formatPace, formatDate } from '../lib/format'

const ICONS = { Run: '🏃', Ride: '🚴', WeightTraining: '🏋️', Hike: '🥾' }
const DETAIL_TYPES = new Set(['Run', 'Ride'])

export default function ActivityCard({ activity: a }) {
  const icon = ICONS[a.type] ?? '•'
  const stats = a.type === 'WeightTraining'
    ? [formatDuration(a.moving_time), a.average_heartrate ? `${a.average_heartrate} bpm` : null]
    : [formatDistance(a.distance), formatDuration(a.moving_time), formatPace(a.average_speed)]
  const inner = (
    <div className="activity-card">
      <div className="icon">{icon}</div>
      <div className="body">
        <div className="name">{a.name}</div>
        <div className="meta">{formatDate(a.start_date)}</div>
      </div>
      <div className="stats">
        {stats.filter(Boolean).map((s, i) => <span key={i}>{s}</span>)}
      </div>
    </div>
  )
  return DETAIL_TYPES.has(a.type) ? <Link to={`/activity/${a.id}`}>{inner}</Link> : inner
}
