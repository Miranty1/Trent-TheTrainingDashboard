import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import Overview from './Overview'
import * as data from '../lib/data'

const page1 = Array.from({ length: 25 }, (_, i) => ({
  id: `r${i}`, type: 'Run', name: `Run ${i}`, start_date: `2026-06-${String(20 - (i % 20) + 1).padStart(2, '0')}T08:00:00Z`,
  distance: 5000, moving_time: 1500, average_speed: 3.3,
}))

test('renders weekly totals and the activity feed', async () => {
  vi.spyOn(data, 'weeklyTotals').mockResolvedValue({ distance: 12000, movingTime: 3600, elevation: 80, count: 2 })
  vi.spyOn(data, 'listActivities').mockResolvedValue(page1)
  render(<MemoryRouter><Overview /></MemoryRouter>)
  await waitFor(() => expect(screen.getByText('12.0 km')).toBeInTheDocument())
  expect(screen.getByText('Run 0')).toBeInTheDocument()
})

test('Load more fetches the next page with a before cursor', async () => {
  vi.spyOn(data, 'weeklyTotals').mockResolvedValue({ distance: 0, movingTime: 0, elevation: 0, count: 0 })
  const spy = vi.spyOn(data, 'listActivities').mockResolvedValue(page1)
  render(<MemoryRouter><Overview /></MemoryRouter>)
  await waitFor(() => expect(screen.getByText('Run 0')).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: /Load more/i }))
  await waitFor(() => expect(spy).toHaveBeenCalledTimes(2))
  expect(spy.mock.calls[1][0]).toHaveProperty('before')
})
