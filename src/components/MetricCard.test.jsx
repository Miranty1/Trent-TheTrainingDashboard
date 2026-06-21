import { render, screen } from '@testing-library/react'
import MetricCard from './MetricCard'

test('MetricCard renders label and value', () => {
  render(<MetricCard label="Distance" value="15.0 km" />)
  expect(screen.getByText('Distance')).toBeInTheDocument()
  expect(screen.getByText('15.0 km')).toBeInTheDocument()
})
