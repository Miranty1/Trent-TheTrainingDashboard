import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi } from 'vitest'
import RequireAuth from './RequireAuth'
import * as sessionMod from './SessionProvider'

test('redirects to /login when no session', () => {
  vi.spyOn(sessionMod, 'useSession').mockReturnValue({ session: null, loading: false })
  render(
    <MemoryRouter initialEntries={['/secret']}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/secret" element={<RequireAuth><div>Secret</div></RequireAuth>} />
      </Routes>
    </MemoryRouter>,
  )
  expect(screen.getByText('Login Page')).toBeInTheDocument()
})

test('shows loading while session is resolving', () => {
  vi.spyOn(sessionMod, 'useSession').mockReturnValue({ session: null, loading: true })
  render(
    <MemoryRouter initialEntries={['/secret']}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/secret" element={<RequireAuth><div>Secret</div></RequireAuth>} />
      </Routes>
    </MemoryRouter>,
  )
  expect(screen.getByText(/Loading/i)).toBeInTheDocument()
})
