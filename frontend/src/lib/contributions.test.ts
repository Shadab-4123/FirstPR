import { describe, expect, it } from 'vitest'

import type { ContributionDay } from '../api/client'
import { activityStats, formatDay, monthLabels, monthlyTotals, weekday } from './contributions'

/** Consecutive days from `start`, one count each, split into Sunday-first weeks. */
const calendar = (start: string, counts: number[]): ContributionDay[][] => {
  const weeks: ContributionDay[][] = []
  counts.forEach((count, i) => {
    const d = new Date(`${start}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + i)
    const date = d.toISOString().slice(0, 10)
    if (d.getUTCDay() === 0 || weeks.length === 0) weeks.push([])
    weeks.at(-1)!.push({ date, count, level: count ? 1 : 0 })
  })
  return weeks
}

describe('activityStats', () => {
  it('finds the longest run, the busiest day and the active days', () => {
    const stats = activityStats(calendar('2026-11-01', [1, 2, 0, 3, 9, 1, 0, 0]))
    expect(stats.longestStreak).toBe(3)
    expect(stats.busiest).toEqual({ date: '2026-11-05', count: 9, level: 1 })
    expect(stats.activeDays).toBe(5)
  })

  it("doesn't break the current streak just because today has nothing yet", () => {
    expect(activityStats(calendar('2026-11-01', [0, 4, 2, 1, 0])).currentStreak).toBe(3)
    expect(activityStats(calendar('2026-11-01', [0, 4, 2, 0, 0])).currentStreak).toBe(0)
  })

  it('copes with a year of nothing', () => {
    expect(activityStats(calendar('2026-11-01', [0, 0, 0]))).toEqual({
      longestStreak: 0,
      currentStreak: 0,
      busiest: null,
      activeDays: 0,
    })
  })
})

describe('labels', () => {
  it('reads dates as calendar days, whatever the time zone', () => {
    expect(weekday('2026-11-15')).toBe(0) // a Sunday
    expect(formatDay('2026-11-15')).toBe('Sun, Nov 15, 2026')
  })

  it('names each month once, dropping a first partial month that would crowd the next', () => {
    const weeks = calendar('2026-10-25', Array(30).fill(1)) // starts with one week of October
    expect(monthLabels(weeks)).toEqual([{ week: 1, label: 'Nov' }])
  })

  it('totals each month for the table view', () => {
    expect(monthlyTotals(calendar('2026-10-30', [2, 0, 5, 1]))).toEqual([
      { month: 'October 2026', total: 2, activeDays: 1 },
      { month: 'November 2026', total: 6, activeDays: 2 },
    ])
  })
})
