import { useEffect, useState } from 'react'
import { invokeFn } from '../lib/functions'

export default function Settings() {
  const [status, setStatus] = useState({ loading: true })
  const [apiKey, setApiKey] = useState('')
  const [athleteId, setAthleteId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function loadStatus() {
    invokeFn('intervals-athlete')
      .then((d) => setStatus({ loading: false, ...d }))
      .catch(() => setStatus({ loading: false, connected: false }))
  }

  useEffect(loadStatus, [])

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await invokeFn('intervals-save-key', { apiKey, athleteId })
      if (!res.ok) throw new Error(res.error || 'Could not validate credentials')
      setApiKey('')
      setStatus({ loading: false, connected: true, athlete: res.athlete })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (status.loading) return <main><h2>Settings</h2><p>Loading…</p></main>

  return (
    <main>
      <h2>Settings</h2>
      <section>
        <h3>Intervals.icu</h3>
        {status.connected ? (
          <p>Connected as {status.athlete?.name ?? status.athlete?.id}</p>
        ) : (
          <p>Not connected</p>
        )}
        <form onSubmit={save}>
          <label htmlFor="apiKey">API key</label>
          <input id="apiKey" type="password" value={apiKey} required
            onChange={(e) => setApiKey(e.target.value)} />
          <label htmlFor="athleteId">Athlete ID</label>
          <input id="athleteId" type="text" value={athleteId} required
            placeholder="i123456" onChange={(e) => setAthleteId(e.target.value)} />
          <button type="submit" disabled={saving}>
            {status.connected ? 'Reconnect Intervals.icu' : 'Connect Intervals.icu'}
          </button>
          {error && <p role="alert">{error}</p>}
        </form>
      </section>
    </main>
  )
}
