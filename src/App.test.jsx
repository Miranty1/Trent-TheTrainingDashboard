import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

test('renders the Trent app shell', () => {
  render(<MemoryRouter><App /></MemoryRouter>)
  expect(screen.getByText(/Trent/i)).toBeInTheDocument()
})
