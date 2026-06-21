import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import Gym from './Gym'
import * as data from '../lib/data'

test('lists gym sessions with duration and HR', async () => {
  vi.spyOn(data, 'listGymSessions').mockResolvedValue([
    { id: 'g1', name: 'Push Day', start_date: '2026-06-19T18:00:00Z', moving_time: 3600, average_heartrate: 110, max_heartrate: 150 },
  ])
  render(<Gym />)
  await waitFor(() => expect(screen.getByText('Push Day')).toBeInTheDocument())
  expect(screen.getByText('1:00:00')).toBeInTheDocument()
  expect(screen.getByText('110')).toBeInTheDocument()
})

test('shows empty state when there are no sessions', async () => {
  vi.spyOn(data, 'listGymSessions').mockResolvedValue([])
  render(<Gym />)
  await waitFor(() => expect(screen.getByText(/No gym sessions/i)).toBeInTheDocument())
})
