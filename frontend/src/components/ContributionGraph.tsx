import { useEffect, useRef, useState } from 'react'

import type { ContributionDay } from '../api/client'
import { formatDay, monthLabels, monthlyTotals, weekday } from '../lib/contributions'

/** GitHub's five shades as one green ramp, darker = more. Checked with the dataviz validator:
    one hue, lightness falls step by step, and the palest green clears 2:1 on white.
    Level 0 is the neutral "nothing that day" grey, not part of the ramp. */
const SHADES = ['bg-[#e7e5e4]', 'bg-[#10b981]', 'bg-[#059669]', 'bg-[#047857]', 'bg-[#064e3b]']

const CELL = 12 // px, plus a 3 px gap: 53 weeks ≈ 800 px, the width of GitHub's own graph
const DAY_LABELS = [
  { row: 1, label: 'Mon' },
  { row: 3, label: 'Wed' },
  { row: 5, label: 'Fri' },
]

const contributions = (n: number) => `${n.toLocaleString()} contribution${n === 1 ? '' : 's'}`

/** The year of contributions as GitHub draws it: a column per week, a row per weekday. */
export const ContributionGraph = ({ weeks }: { weeks: ContributionDay[][] }) => {
  const [hover, setHover] = useState<{ day: ContributionDay; x: number; y: number } | null>(null)
  const [asTable, setAsTable] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)

  // On a narrow screen, start at the most recent weeks, like GitHub does.
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [weeks, asTable])

  const labels = monthLabels(weeks)

  return (
    <figure className="min-w-0">
      {asTable ? (
        <MonthTable weeks={weeks} />
      ) : (
        <div ref={scroller} className="relative overflow-x-auto pt-10 pb-2" onMouseLeave={() => setHover(null)}>
          <div className="relative inline-grid grid-cols-[2rem_auto] gap-x-1.5">
            {/* Month names */}
            <div />
            <div className="relative h-5 text-xs text-muted" aria-hidden="true">
              {labels.map(({ week, label }) => (
                <span key={`${label}-${week}`} className="absolute top-0" style={{ left: week * (CELL + 3) }}>
                  {label}
                </span>
              ))}
            </div>

            {/* Weekday names */}
            {/* Pinned to the left, so the labels stay put while the weeks scroll on a phone. */}
            <div
              className="sticky left-0 z-[1] grid bg-white text-xs text-muted"
              style={{ gridTemplateRows: `repeat(7, ${CELL}px)`, rowGap: 3 }}
              aria-hidden="true"
            >
              {DAY_LABELS.map(({ row, label }) => (
                <span key={label} className="leading-3" style={{ gridRow: row + 1 }}>
                  {label}
                </span>
              ))}
            </div>

            {/* The days. Hidden from screen readers: the summary above and the table view say
                the same thing in a form that can be read. */}
            <div
              aria-hidden="true"
              className="grid grid-flow-col"
              style={{ gridTemplateRows: `repeat(7, ${CELL}px)`, gridAutoColumns: `${CELL}px`, gap: 3 }}
            >
              {weeks.map((week, w) =>
                week.map((day) => (
                  <span
                    key={day.date}
                    className={`rounded-[3px] ${SHADES[day.level] ?? SHADES[0]} ${
                      hover?.day.date === day.date ? 'ring-2 ring-ink ring-offset-1' : ''
                    }`}
                    style={{ gridColumn: w + 1, gridRow: weekday(day.date) + 1 }}
                    onMouseEnter={(e) => {
                      const cell = e.currentTarget.getBoundingClientRect()
                      const box = scroller.current!.getBoundingClientRect()
                      setHover({
                        day,
                        x: cell.left - box.left + scroller.current!.scrollLeft + CELL / 2,
                        y: cell.top - box.top,
                      })
                    }}
                  />
                )),
              )}
            </div>
          </div>

          {hover && (
            <p
              role="status"
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-ink px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lift"
              style={{ left: hover.x, top: hover.y - 6 }}
            >
              <strong className="font-semibold">{hover.day.count === 0 ? 'No contributions' : contributions(hover.day.count)}</strong>{' '}
              on {formatDay(hover.day.date)}
            </p>
          )}
        </div>
      )}

      <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
        <button
          type="button"
          onClick={() => setAsTable((t) => !t)}
          className="font-semibold text-link hover:underline"
          aria-pressed={asTable}
        >
          {asTable ? 'Show as graph' : 'Show as table'}
        </button>
        {!asTable && (
          <span className="flex items-center gap-1.5">
            Less
            {SHADES.map((shade) => (
              <span key={shade} aria-hidden="true" className={`size-3 rounded-[3px] ${shade}`} />
            ))}
            More
          </span>
        )}
      </figcaption>
    </figure>
  )
}

const MonthTable = ({ weeks }: { weeks: ContributionDay[][] }) => (
  <div className="overflow-x-auto rounded-xl border border-rule">
    <table className="w-full text-left text-sm">
      <caption className="sr-only">Contributions per month, oldest first</caption>
      <thead className="bg-well/70 text-xs text-muted">
        <tr>
          <th scope="col" className="px-4 py-2 font-semibold">Month</th>
          <th scope="col" className="px-4 py-2 text-right font-semibold">Contributions</th>
          <th scope="col" className="px-4 py-2 text-right font-semibold">Days with any</th>
        </tr>
      </thead>
      <tbody>
        {monthlyTotals(weeks).map((row) => (
          <tr key={row.month} className="border-t border-rule">
            <th scope="row" className="px-4 py-2 font-medium text-ink">{row.month}</th>
            <td className="px-4 py-2 text-right tabular-nums">{row.total.toLocaleString()}</td>
            <td className="px-4 py-2 text-right tabular-nums">{row.activeDays}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)
