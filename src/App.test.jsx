import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import App from './App'
import * as sessionMod from './auth/SessionProvider'

test('renders the Trent app shell', () => {
  vi.spyOn(sessionMod, 'useSession').mockReturnValue({ session: null, loading: false })
  render(<MemoryRouter initialEntries={['/login']}><App /></MemoryRouter>)
  expect(screen.getByText(/Trent/i)).toBeInTheDocument()
})
