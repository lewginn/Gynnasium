import { describe, expect, it } from 'vitest'
import { formatDuration } from './format'

describe('formatDuration', () => {
  it('rounds to minutes, and never says 0 min', () => {
    expect(formatDuration(20_000)).toBe('<1 min')
    expect(formatDuration(52 * 60_000)).toBe('52 min')
    expect(formatDuration(65 * 60_000)).toBe('1h 05m')
  })
})
