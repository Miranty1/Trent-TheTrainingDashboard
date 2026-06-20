import { Navigate } from 'react-router-dom'
import { useSession } from './SessionProvider'

export default function RequireAuth({ children }) {
  const { session, loading } = useSession()
  if (loading) return <p>Loading…</p>
  if (!session) return <Navigate to="/login" replace />
  return children
}
