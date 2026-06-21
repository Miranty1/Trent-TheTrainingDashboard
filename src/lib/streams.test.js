import { streamsByType, computeSplits } from './streams'

test('streamsByType keys the raw array by type; {} for non-array', () => {
  const raw = [{ type: 'time', data: [0, 1] }, { type: 'latlng', data: [[1, 2]] }]
  expect(streamsByType(raw)).toEqual({ time: [0, 1], latlng: [[1, 2]] })
  expect(streamsByType(null)).toEqual({})
})

test('computeSplits: one split per full km with elapsed time + avg HR', () => {
  // distance crosses 1000m at index 2 (t=300s) and 2000m at index 4 (t=620s)
  const s = {
    distance: [0, 600, 1000, 1600, 2000],
    time: [0, 180, 300, 480, 620],
    heartrate: [120, 134, 146, 152, 160],
  }
  const splits = computeSplits(s)
  expect(splits).toHaveLength(2)
  expect(splits[0]).toEqual({ km: 1, seconds: 300, avgHr: 133 })
  expect(splits[1]).toEqual({ km: 2, seconds: 320, avgHr: 153 })
})

test('computeSplits: empty when streams missing', () => {
  expect(computeSplits({})).toEqual([])
})
