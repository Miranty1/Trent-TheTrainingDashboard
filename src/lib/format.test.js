import { formatDistance, formatDuration, formatPace, formatElevation, formatDate } from './format'

test('formatDistance: metres → km, one decimal', () => {
  expect(formatDistance(15012.18)).toBe('15.0 km')
  expect(formatDistance(0)).toBe('0.0 km')
  expect(formatDistance(null)).toBe('—')
})

test('formatDuration: h:m:s with and without hours', () => {
  expect(formatDuration(5954)).toBe('1:39:14')
  expect(formatDuration(2354)).toBe('39:14')
  expect(formatDuration(null)).toBe('—')
})

test('formatPace: m/s → min/km, rounds seconds, handles 60', () => {
  expect(formatPace(2.519)).toBe('6:37 /km')
  expect(formatPace(0)).toBe('—')
  expect(formatPace(null)).toBe('—')
})

test('formatElevation: rounded metres', () => {
  expect(formatElevation(69.98)).toBe('70 m')
  expect(formatElevation(null)).toBe('—')
})

test('formatDate: short readable date', () => {
  expect(formatDate('2026-06-20T04:05:47Z')).toMatch(/2026/)
  expect(formatDate(null)).toBe('—')
})
