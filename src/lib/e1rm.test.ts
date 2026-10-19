import { describe, expect, it } from 'vitest'
import { brzycki, epley, estimate1RM } from './e1rm'

describe('e1RM formulas', () => {
  it('Epley: 100kg x 5 ≈ 116.7', () => {
    expect(epley(100, 5)).toBeCloseTo(116.67, 1)
  })

  it('Brzycki: 100kg x 5 = 112.5', () => {
    expect(brzycki(100, 5)).toBeCloseTo(112.5, 1)
  })

  it('a single is its own 1RM', () => {
    expect(estimate1RM(140, 1)).toBe(140)
  })

  it('averages both formulas', () => {
    expect(estimate1RM(100, 5)).toBeCloseTo((116.667 + 112.5) / 2, 1)
  })

  it('adds reps in reserve when RPE is given', () => {
    // 5 @ RPE 8 ≈ 7 reps to failure
    expect(estimate1RM(100, 5, 8)).toBeCloseTo(estimate1RM(100, 7)!, 5)
  })

  it('ignores high-rep sets and empty sets', () => {
    expect(estimate1RM(60, 15)).toBeNull()
    expect(estimate1RM(60, 10, 6)).toBeNull() // 10 + 4 RIR
    expect(estimate1RM(0, 5)).toBeNull()
    expect(estimate1RM(100, 0)).toBeNull()
  })
})
