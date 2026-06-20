import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import Settings from './Settings'
import * as fns from '../lib/functions'

test('shows Not connected and the key form when no credentials are stored', async () => {
  vi.spyOn(fns, 'invokeFn').mockResolvedValue({ connected: false })
  render(<Settings />)
  await waitFor(() => expect(screen.getByText(/Not connected/i)).toBeInTheDocument())
  expect(screen.getByLabelText(/API key/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/Athlete ID/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Connect Intervals\.icu/i })).toBeInTheDocument()
})
