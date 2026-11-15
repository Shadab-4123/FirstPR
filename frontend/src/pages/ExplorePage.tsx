import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'

import { api, type LevelSummary } from '../api/client'
import { SiteHeader } from '../components/SiteHeader'
import { LEVEL_INFO, kindLabel } from '../lib/levels'

/** Pick your level: three doors, each saying who it's for and what's behind it. */
export const ExplorePage = () => {
  const levels = useQuery({ queryKey: ['levels'], queryFn: api.levels, staleTime: 60_000 })

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 sm:px-8">
      <SiteHeader />
      <main className="pt-8 sm:pt-14">
        <h1 className="max-w-[24ch] font-display text-3xl leading-tight font-semibold text-pretty sm:text-4xl">
          Where are you in your open source journey?
        </h1>
        <p className="mt-3 max-w-prose text-muted">
          Pick the level that sounds like you. Inside, issues are grouped by the kind of work: docs, tests,
          bug fixes, features and more.
        </p>

        {levels.isError ? (
          <div role="alert" className="py-12">
            <p className="font-display text-xl font-medium">Levels couldn't be loaded.</p>
            <button
              type="button"
              onClick={() => levels.refetch()}
              className="mt-4 rounded-md bg-ink px-4 py-2 font-semibold text-white hover:bg-link"
            >
              Try again
            </button>
          </div>
        ) : (
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {(levels.data ?? PLACEHOLDER).map((summary, i) => (
              <LevelCard key={summary.level} summary={summary} step={i + 1} loading={levels.isPending} />
            ))}
          </ol>
        )}

        <p className="mt-10 max-w-prose text-sm text-muted">
          Never contributed before? Read{' '}
          <Link to="/guide" className="text-link underline">
            your first pull request in 6 steps
          </Link>{' '}
          first. It takes five minutes.
        </p>
      </main>
    </div>
  )
}

const PLACEHOLDER: LevelSummary[] = (['new', 'some', 'experienced'] as const).map((level) => ({
  level,
  total: 0,
  kinds: [],
}))

const LevelCard = ({ summary, step, loading }: { summary: LevelSummary; step: number; loading: boolean }) => {
  const info = LEVEL_INFO[summary.level]
  const topKinds = summary.kinds.slice(0, 3)
  return (
    <li>
      <Link
        to={`/explore/${summary.level}`}
        className="group flex h-full flex-col rounded-lg border border-rule bg-white p-5 hover:border-ink"
      >
        <span className="text-xs font-semibold tracking-wide text-muted uppercase">Level {step}</span>
        <h2 className="mt-1 font-display text-xl font-semibold group-hover:text-link">{info.title}</h2>
        <p className="mt-2 text-sm">{info.who}</p>
        <p className="mt-2 text-sm text-muted">{info.what}</p>
        <p className="mt-auto pt-5 text-sm font-semibold" aria-live="polite">
          {loading ? (
            <span className="inline-block h-4 w-24 animate-pulse rounded bg-rule" />
          ) : summary.total === 0 ? (
            <span className="font-normal text-muted">No open issues yet. The next daily sync adds more.</span>
          ) : (
            <>
              {summary.total.toLocaleString()} open issues
              <span className="block font-normal text-muted">
                Mostly {topKinds.map((k) => kindLabel(k.value).toLowerCase()).join(', ')}
              </span>
            </>
          )}
        </p>
      </Link>
    </li>
  )
}
