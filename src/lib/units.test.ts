import { describe, expect, it } from 'vitest'
import { formatWeight, roundForDisplay, toDisplay, toKg } from './units'

describe('units', () => {
  it('round-trips kg → lb → kg', () => {
    expect(toKg(toDisplay(100, 'lb'), 'lb')).toBeCloseTo(100, 10)
  })

  it('100kg ≈ 220.5lb', () => {
    expect(roundForDisplay(toDisplay(100, 'lb'), 'lb')).toBe(220.5)
  })

  it('formats without float noise', () => {
    expect(formatWeight(100, 'kg')).toBe('100kg')
    expect(formatWeight(102.5, 'kg')).toBe('102.5kg')
    expect(formatWeight(toKg(225, 'lb'), 'lb')).toBe('225lb')
    expect(formatWeight(toKg(135, 'lb'), 'kg')).toBe('61.25kg')
  })
})
