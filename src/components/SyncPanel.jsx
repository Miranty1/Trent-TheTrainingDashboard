import { useRef, useState } from 'react'
import { invokeFn } from '../lib/functions'

export default function SyncPanel() {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const stopRef = useRef(false)

  async function syncNow() {
    setBusy(true); setMsg(null)
    try {
      const r = await invokeFn('sync', { mode: 'recent' })
      setMsg(r.ok ? `Synced ${r.syncedActivities} activities` : `Error: ${r.error}`)
    } catch (e) {
      setMsg(`Error: ${e.message}`)
    } finally { setBusy(false) }
  }

  async function backfill() {
    setBusy(true); setMsg(null); stopRef.current = false
    try {
      let total = 0
      // Auto-continue batches until done or stopped.
      while (true) {
        const r = await invokeFn('sync', { mode: 'backfill' })
        if (!r.ok) { setMsg(`Error: ${r.error}`); break }
        total += r.syncedActivities
        setMsg(`Backfilling… ${total} activities (to ${r.oldestReached})`)
        if (r.done) { setMsg(`Backfill complete — ${total} activities`); break }
        if (stopRef.current) { setMsg(`Stopped — ${total} activities so far`); break }
      }
    } catch (e) {
      setMsg(`Error: ${e.message}`)
    } finally { setBusy(false) }
  }

  return (
    <section>
      <h3>Sync</h3>
      <button onClick={syncNow} disabled={busy}>Sync now</button>
      <button onClick={backfill} disabled={busy}>Sync older history</button>
      {busy && <button onClick={() => { stopRef.current = true }}>Stop</button>}
      {msg && <p>{msg}</p>}
    </section>
  )
}
