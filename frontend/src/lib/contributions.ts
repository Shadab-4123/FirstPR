import type { ContributionDay } from '../api/client'

/** Numbers worked out from the same calendar the grid shows. */
export type ActivityStats = {
  longestStreak: number
  currentStreak: number
  busiest: ContributionDay | null
  activeDays: number
}

export const activityStats = (weeks: ContributionDay[][]): ActivityStats => {
  const days = weeks.flat()
  let longest = 0
  let run = 0
  for (const day of days) {
    run = day.count > 0 ? run + 1 : 0
    longest = Math.max(longest, run)
  }
  // Today may have no contributions *yet*: count back from yesterday in that case.
  let i = days.length - 1
  if (i >= 0 && days[i].count === 0) i -= 1
  let current = 0
  while (i >= 0 && days[i].count > 0) {
    current += 1
    i -= 1
  }
  const busiest = days.reduce<ContributionDay | null>((best, d) => (d.count > (best?.count ?? 0) ? d : best), null)
  return { longestStreak: longest, currentStreak: current, busiest, activeDays: days.filter((d) => d.count > 0).length }
}

const MONTH = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' })
const MONTH_YEAR = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const DAY = new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

const utc = (date: string) => new Date(`${date}T00:00:00Z`)

/** "Mon, Nov 10, 2026", for tooltips. Dates are calendar days, so they're read as UTC. */
export const formatDay = (date: string) => DAY.format(utc(date))

/** 0 = Sunday … 6 = Saturday: the row a day sits in, as on GitHub. */
export const weekday = (date: string) => utc(date).getUTCDay()

/** Month names above the grid: one at each week where a new month starts, skipping any that
    would sit closer than three weeks to the previous label (the first, partial month). */
export const monthLabels = (weeks: ContributionDay[][]): { week: number; label: string }[] => {
  const labels: { week: number; label: string }[] = []
  let lastMonth = -1
  weeks.forEach((week, i) => {
    const first = week[0]
    if (!first) return
    const month = utc(first.date).getUTCMonth()
    if (month === lastMonth) return
    lastMonth = month
    const previous = labels.at(-1)
    if (previous && i - previous.week < 3) labels.pop()
    labels.push({ week: i, label: MONTH.format(utc(first.date)) })
  })
  return labels
}

/** Totals per month, oldest first, for the table view. */
export const monthlyTotals = (weeks: ContributionDay[][]) => {
  const months = new Map<string, { month: string; total: number; activeDays: number }>()
  for (const day of weeks.flat()) {
    const key = day.date.slice(0, 7)
    const row = months.get(key) ?? { month: MONTH_YEAR.format(utc(day.date)), total: 0, activeDays: 0 }
    row.total += day.count
    if (day.count > 0) row.activeDays += 1
    months.set(key, row)
  }
  return [...months.values()]
}
