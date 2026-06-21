import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi } from 'vitest'
import ActivityDetail from './ActivityDetail'
import * as data from '../lib/data'

vi.mock('../components/RouteMap', () => ({ default: () => <div data-testid="map" /> }))
vi.mock('../components/StreamChart', () => ({ default: ({ label }) => <div>{`chart:${label}`}</div> }))

function renderAt(id) {
  return render(
    <MemoryRouter initialEntries={[`/activity/${id}`]}>
      <Routes><Route path="/activity/:id" element={<ActivityDetail />} /></Routes>
    </MemoryRouter>,
  )
}

test('Run shows map, charts, and a splits table', async () => {
  vi.spyOn(data, 'getActivity').mockResolvedValue({ id: 'i1', type: 'Run', name: 'Long Run', start_date: '2026-06-20T04:05:47Z', distance: 2000, moving_time: 620, average_speed: 3.2 })
  vi.spyOn(data, 'getStreams').mockResolvedValue([
    { type: 'time', data: [0, 300, 620] },
    { type: 'distance', data: [0, 1000, 2000] },
    { type: 'heartrate', data: [120, 140, 160] },
    { type: 'latlng', data: [[1, 2], [1.1, 2.1]] },
  ])
  renderAt('i1')
  await waitFor(() => expect(screen.getByText('Long Run')).toBeInTheDocument())
  await waitFor(() => expect(screen.getByTestId('map')).toBeInTheDocument())
  expect(screen.getByText('chart:Heart rate')).toBeInTheDocument()
  expect(screen.getByText('chart:Pace')).toBeInTheDocument()
  expect(screen.getByText('chart:Elevation')).toBeInTheDocument()
  expect(screen.getByRole('table')).toBeInTheDocument()
})

test('Gym activity is summary-only: no map, no streams fetch', async () => {
  vi.spyOn(data, 'getActivity').mockResolvedValue({ id: 'i2', type: 'WeightTraining', name: 'Push Day', start_date: '2026-06-19T18:00:00Z', moving_time: 3600, average_speed: null, distance: null })
  const streamsSpy = vi.spyOn(data, 'getStreams').mockResolvedValue(null)
  renderAt('i2')
  await waitFor(() => expect(screen.getByText('Push Day')).toBeInTheDocument())
  expect(screen.queryByTestId('map')).toBeNull()
  expect(streamsSpy).not.toHaveBeenCalled()
})
