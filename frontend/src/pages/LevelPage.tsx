import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, Navigate, useParams, useSearchParams } from 'react-router'

import { api, type Kind, type Level } from '../api/client'
import { IssueRow } from '../components/IssueRow'
import { Pagination } from '../components/Pagination'
import { ErrorState, ResultsSkeleton } from '../components/ResultStates'
import { SiteHeader } from '../components/SiteHeader'
import { KIND_LABELS, LEVEL_INFO, isLevel, kindLabel } from '../lib/levels'

const PAGE_SIZE = 20

export const LevelPage = () => {
  const { level } = useParams()
  if (!isLevel(level)) return <Navigate to="/explore" replace />
  return <LevelIssues level={level} />
}

const LevelIssues = ({ level }: { level: Level }) => {
  const info = LEVEL_INFO[level]
  // The chosen type and page live in the URL, like the search page's filters.
  const [params, setParams] = useSearchParams()
  const kindParam = params.get('kind')
  const kind = kindParam && kindParam in KIND_LABELS ? (kindParam as Kind) : undefined
  const page = Math.max(1, Number(params.get('page')) || 1)

  const levels = useQuery({ queryKey: ['levels'], queryFn: api.levels, staleTime: 60_000 })
  const summary = levels.data?.find((s) => s.level === level)
  const query = { level, kind, page, page_size: PAGE_SIZE, sort: 'relevance' as const }
  const issues = useQuery({
    queryKey: ['issues', query],
    queryFn: () => api.searchIssues(query),
    placeholderData: keepPreviousData,
  })

  const choose = (next: { kind?: Kind; page?: number }) => {
    const entries: [string, string][] = []
    const nextKind = 'kind' in next ? next.kind : kind
    if (nextKind) entries.push(['kind', nextKind])
    if (next.page && next.page > 1) entries.push(['page', String(next.page)])
    setParams(entries)
  }
  const total = issues.data?.total ?? 0

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 sm:px-8">
      <SiteHeader />
      <main className="pt-2 sm:pt-4">
        <Link to="/explore" className="text-sm text-link hover:underline">
          ← All levels
        </Link>
        <h1 className="mt-6 font-display text-3xl font-semibold sm:text-4xl">{info.title}</h1>
        <p className="mt-2 max-w-prose">{info.who}</p>
        <p className="mt-1 max-w-prose text-sm text-muted">{info.what}</p>

        {level === 'new' && <GuideCallout />}

        <nav aria-label="Kind of work" className="mt-8 border-b-2 border-ink pb-3">
          <ul className="flex flex-wrap gap-2">
            <KindChip label="Everything" count={summary?.total} active={!kind} onClick={() => choose({ kind: undefined })} />
            {summary?.kinds.map((k) => (
              <KindChip
                key={k.value}
                label={kindLabel(k.value)}
                count={k.count}
                active={kind === k.value}
                onClick={() => choose({ kind: k.value as Kind })}
              />
            ))}
          </ul>
        </nav>

        {issues.isPending ? (
          <ResultsSkeleton />
        ) : issues.isError ? (
          <ErrorState message={issues.error.message} onRetry={() => issues.refetch()} />
        ) : total === 0 ? (
          <div className="py-16">
            <p className="font-display text-2xl font-medium">Nothing here yet.</p>
            <p className="mt-2 max-w-prose text-muted">
              {level === 'experienced'
                ? 'Experienced-level issues come from "help wanted" labels and bugs in big projects, which the daily sync is starting to collect. Check back tomorrow.'
                : 'Try another kind of work, or another level.'}
            </p>
          </div>
        ) : (
          <>
            <ul className={issues.isPlaceholderData ? 'opacity-60' : undefined}>
              {issues.data.items.map((issue) => (
                <IssueRow key={issue.id} issue={issue} />
              ))}
            </ul>
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onPage={(p) => {
                choose({ page: p })
                window.scrollTo({ top: 0 })
              }}
            />
          </>
        )}
      </main>
    </div>
  )
}

type KindChipProps = { label: string; count: number | undefined; active: boolean; onClick: () => void }

const KindChip = ({ label, count, active, onClick }: KindChipProps) => (
  <li>
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-sm ${
        active ? 'border-ink bg-ink text-white' : 'border-rule bg-white hover:border-ink'
      }`}
    >
      {label}
      {count !== undefined && <span className={active ? 'ml-1.5 text-white/70' : 'ml-1.5 text-muted'}>{count}</span>}
    </button>
  </li>
)

const GuideCallout = () => (
  <aside className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-link/30 bg-link/5 px-5 py-4">
    <div>
      <p className="font-semibold">First time? Start with the guide.</p>
      <p className="text-sm text-muted">Six steps from picking an issue to opening your pull request.</p>
    </div>
    <Link to="/guide" className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-link">
      Read the guide
    </Link>
  </aside>
)
