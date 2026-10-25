import { describe, expect, it } from 'vitest'
import { formatDuration, formatFullWhen, formatTime, formatWhen } from './format'

describe('formatDuration', () => {
  it('rounds to minutes, and never says 0 min', () => {
    expect(formatDuration(20_000)).toBe('<1 min')
    expect(formatDuration(52 * 60_000)).toBe('52 min')
    expect(formatDuration(65 * 60_000)).toBe('1h 05m')
  })
})

// Sunday 25 October 2026, evening. Local time, so the tests hold in any time zone.
const NOW = new Date(2026, 9, 25, 20, 0).getTime()
const at = (month: number, day: number, h: number, m: number, year = 2026) => new Date(year, month - 1, day, h, m).getTime()
// ICU puts a narrow no-break space before AM/PM; Safari may not.
const plain = (s: string) => s.replace(/\s/g, ' ')

describe('formatTime', () => {
  it('follows the locale’s clock, zero-padded on 24 hours as on iOS', () => {
    expect(formatTime(at(10, 21, 18, 30), 'en-GB')).toBe('18:30')
    expect(formatTime(at(10, 21, 9, 5), 'en-GB')).toBe('09:05')
    expect(plain(formatTime(at(10, 21, 18, 30), 'en-US'))).toBe('6:30 PM')
    expect(plain(formatTime(at(10, 21, 9, 5), 'en-US'))).toBe('9:05 AM')
  })
})

describe('formatWhen', () => {
  it('says Today and Yesterday by the calendar, not by 24 hours', () => {
    expect(formatWhen(at(10, 25, 7, 15), NOW, 'en-GB')).toBe('Today, 07:15')
    expect(formatWhen(at(10, 24, 23, 50), NOW, 'en-GB')).toBe('Yesterday, 23:50')
    expect(formatWhen(at(10, 24, 0, 5), NOW, 'en-GB')).toBe('Yesterday, 00:05')
  })

  it('gives the weekday within the last week, then the date', () => {
    expect(formatWhen(at(10, 23, 18, 30), NOW, 'en-GB')).toBe('Fri, 18:30')
    expect(formatWhen(at(10, 19, 18, 30), NOW, 'en-GB')).toBe('Mon, 18:30') // six days ago
    expect(formatWhen(at(10, 18, 18, 30), NOW, 'en-GB')).toBe('Sun 18 Oct, 18:30') // a week ago: same weekday, so the date
    expect(formatWhen(at(1, 2, 6, 0), NOW, 'en-GB')).toBe('Fri 2 Jan, 06:00')
  })

  it('adds the year outside the current one', () => {
    expect(formatWhen(at(12, 30, 18, 30, 2025), NOW, 'en-GB')).toBe('Tue, 30 Dec 2025, 18:30')
    // Within the week but last year (on 2 Jan): still the weekday.
    expect(formatWhen(at(12, 30, 18, 30, 2025), at(1, 2, 9, 0), 'en-GB')).toBe('Tue, 18:30')
  })

  it('uses the locale’s order and clock', () => {
    expect(plain(formatWhen(at(10, 25, 18, 30), NOW, 'en-US'))).toBe('Today, 6:30 PM')
    expect(plain(formatWhen(at(10, 21, 18, 30), NOW, 'en-US'))).toBe('Wed, 6:30 PM')
    expect(plain(formatWhen(at(10, 2, 18, 30), NOW, 'en-US'))).toBe('Fri, Oct 2, 6:30 PM')
  })

  it('tells apart two workouts with the same name on different days', () => {
    expect(formatWhen(at(10, 20, 18, 30), NOW, 'en-GB')).not.toBe(formatWhen(at(10, 13, 18, 30), NOW, 'en-GB'))
  })
})

describe('formatFullWhen', () => {
  it('gives the weekday, date, year and time', () => {
    expect(plain(formatFullWhen(at(10, 21, 18, 30), 'en-GB'))).toMatch(/^Wednesday,? 21 October 2026, 18:30$/)
    expect(plain(formatFullWhen(at(10, 21, 18, 30), 'en-US'))).toBe('Wednesday, October 21, 2026, 6:30 PM')
  })
})
