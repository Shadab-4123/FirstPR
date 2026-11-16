import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'

import { api, type LevelSummary } from '../api/client'
import { ArrowRightIcon, BookIcon } from '../components/icons'
import { Notice } from '../components/ResultStates'
import { PageLayout } from '../components/SiteHeader'
import { btnPrimary, card, eyebrow } from '../components/ui'
import { LEVEL_INFO, LEVEL_LOOK, kindLabel } from '../lib/levels'

/** Pick your level: three doors, each saying who it's for and what's behind it. */
export const ExplorePage = () => {
  const levels = useQuery({ queryKey: ['levels'], queryFn: api.levels, staleTime: 60_000 })
  const all = (levels.data ?? []).reduce((sum, s) => sum + s.total, 0)

  return (
    <PageLayout>
      <p className={eyebrow}>
        <span aria-hidden="true" className="size-1.5 rounded-full bg-easy-dot" />
        Explore by level
      </p>
      <h1 className="mt-2 max-w-[24ch] text-3xl leading-tight font-bold tracking-tight text-pretty text-ink sm:text-4xl">
        Where are you in your open source journey?
      </h1>
      <p className="mt-3 max-w-prose text-muted">
        Pick the level that sounds like you. Inside, issues are grouped by the kind of work: docs, tests, bug fixes,
        features and more.
      </p>

      {levels.isError ? (
        <div className="mt-10">
          <Notice
            alert
            title="Levels couldn't be loaded."
            action={
              <button type="button" onClick={() => levels.refetch()} className={btnPrimary}>
                Try again
              </button>
            }
          />
        </div>
      ) : (
        <ol className="mt-10 grid gap-5 md:grid-cols-3">
          {(levels.data ?? PLACEHOLDER).map((summary, i) => (
            <LevelCard key={summary.level} summary={summary} step={i + 1} all={all} loading={levels.isPending} />
          ))}
        </ol>
      )}

      <aside className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-link-soft p-6">
        <div className="flex items-center gap-4">
          <span className="flex size-11 items-center justify-center rounded-full bg-white text-link shadow-card">
            <BookIcon className="size-5" />
          </span>
          <div>
            <p className="font-semibold text-ink">Never contributed before?</p>
            <p className="text-sm text-muted">
              Read{' '}
              <Link to="/guide" className="font-semibold text-link underline">
                your first pull request in 6 steps
              </Link>{' '}
              first. It takes five minutes.
            </p>
          </div>
        </div>
      </aside>
    </PageLayout>
  )
}

const PLACEHOLDER: LevelSummary[] = (['new', 'some', 'experienced'] as const).map((level) => ({
  level,
  total: 0,
  kinds: [],
}))

const LevelCard = ({
  summary,
  step,
  all,
  loading,
}: {
  summary: LevelSummary
  step: number
  all: number
  loading: boolean
}) => {
  const info = LEVEL_INFO[summary.level]
  const look = LEVEL_LOOK[summary.level]
  const topKinds = summary.kinds.slice(0, 3)
  const share = all > 0 ? summary.total / all : 0

  return (
    <li className={`${card} flex flex-col border-t-4 p-6 ${look.rule}`}>
      <span className={`self-start rounded-full px-2.5 py-0.5 text-xs font-semibold ${look.badge}`}>Level {step}</span>
      <h2 className="mt-3 text-xl font-semibold text-ink">{info.title}</h2>
      <p className="mt-2 font-medium text-link">“{info.who}”</p>
      <p className="mt-3 text-sm leading-relaxed text-muted">{info.what}</p>

      <div className="mt-auto pt-6" aria-live="polite">
        {loading ? (
          <span className="block h-12 animate-pulse rounded-xl bg-well" />
        ) : summary.total === 0 ? (
          <p className="text-sm text-muted">No open issues yet. The next daily sync adds more.</p>
        ) : (
          <>
            <p className="flex items-baseline justify-between">
              <span className="text-2xl font-bold text-ink tabular-nums">{summary.total.toLocaleString()}</span>
              <span className="text-xs text-muted">{Math.round(share * 100)}% of open issues</span>
            </p>
            <div className="mt-2 h-1.5 rounded-full bg-well" aria-hidden="true">
              <div className={`h-1.5 rounded-full ${look.bar}`} style={{ width: `${share * 100}%` }} />
            </div>
            <p className="mt-2 text-sm text-muted">
              Mostly {topKinds.map((k) => kindLabel(k.value).toLowerCase()).join(', ')}
            </p>
          </>
        )}
        <Link
          to={`/explore/${summary.level}`}
          className={`mt-5 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition ${look.button}`}
        >
          Explore level {step} issues
          <ArrowRightIcon />
        </Link>
      </div>
    </li>
  )
}
