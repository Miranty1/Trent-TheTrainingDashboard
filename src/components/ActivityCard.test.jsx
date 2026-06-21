import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ActivityCard from './ActivityCard'

const run = { id: 'i1', type: 'Run', name: 'Morning Run', start_date: '2026-06-20T04:05:47Z', distance: 5000, moving_time: 1500, average_speed: 3.3 }
const gym = { id: 'i2', type: 'WeightTraining', name: 'Push Day', start_date: '2026-06-19T18:00:00Z', moving_time: 3600, average_heartrate: 110 }

test('Run card links to its detail page', () => {
  render(<MemoryRouter><ActivityCard activity={run} /></MemoryRouter>)
  expect(screen.getByText('Morning Run').closest('a')).toHaveAttribute('href', '/activity/i1')
})

test('Gym card is summary-only with no detail link', () => {
  render(<MemoryRouter><ActivityCard activity={gym} /></MemoryRouter>)
  expect(screen.getByText('Push Day').closest('a')).toBeNull()
})
