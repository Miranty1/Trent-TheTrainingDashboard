import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import SyncPanel from './SyncPanel'
import * as fns from '../lib/functions'

test('Sync now calls sync(recent) and shows the result', async () => {
  const spy = vi.spyOn(fns, 'invokeFn').mockResolvedValue({ ok: true, mode: 'recent', syncedActivities: 3 })
  render(<SyncPanel />)
  fireEvent.click(screen.getByRole('button', { name: /Sync now/i }))
  await waitFor(() => expect(screen.getByText(/Synced 3/i)).toBeInTheDocument())
  expect(spy).toHaveBeenCalledWith('sync', { mode: 'recent' })
})
