import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, Navigate, useParams, useSearchParams } from 'react-router'

import { api, type Kind, type Level } from '../api/client'
import { IssueRow } from '../components/IssueRow'
import { Pagination } from '../components/Pagination'
import { ArrowRightIcon, BookIcon, CheckCircleIcon } from '../components/icons'
import { ErrorState, Notice, ResultsSkeleton } from '../components/ResultStates'
import { PageLayout } from '../components/SiteHeader'
import { btnPrimary, card } from '../components/ui'
import { KIND_LABELS, LEVEL_INFO, LEVEL_LOOK, LEVELS, isLevel, kindLabel } from '../lib/levels'

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

  const step = LEVELS.indexOf(level) + 1
  const look = LEVEL_LOOK[level]

  return (
    <PageLayout>
      <Link to="/explore" className="inline-flex items-center gap-1.5 text-sm font-semibold text-link hover:underline">
        ← All levels
      </Link>

      <header className={`${card} mt-4 flex flex-wrap items-start justify-between gap-4 border-t-4 p-6 sm:p-8 ${look.rule}`}>
        <div className="max-w-2xl">
          <span className={`rounded-full px-2.5 py-0.5 font-mono text-xs font-semibold tracking-wide uppercase ${look.badge}`}>
            Level 0{step}
          </span>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink sm:text-4xl">{info.title}</h1>
          <p className="mt-2 text-lg text-body">{info.who}</p>
          <p className="mt-1 text-sm text-muted">{info.what}</p>
        </div>
        {summary && (
          <p className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-white px-3 py-1 text-sm font-semibold text-ink">
            <CheckCircleIcon className="size-4 text-easy" />
            {summary.total.toLocaleString()} open, unclaimed issues
          </p>
        )}
      </header>

      {level === 'new' && <GuideCallout />}

      <nav aria-label="Kind of work" className="mt-8">
        <p className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Filter by kind of work</p>
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

      <div className="mt-6">
        {issues.isPending ? (
          <ResultsSkeleton />
        ) : issues.isError ? (
          <ErrorState message={issues.error.message} onRetry={() => issues.refetch()} />
        ) : total === 0 ? (
          <Notice title="Nothing here yet.">
            {level === 'experienced'
              ? 'Experienced-level issues come from "help wanted" labels and bugs in big projects, which the daily sync is starting to collect. Check back tomorrow.'
              : 'Try another kind of work, or another level.'}
          </Notice>
        ) : (
          <>
            <ul className={`space-y-4 transition-opacity ${issues.isPlaceholderData ? 'opacity-60' : ''}`}>
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
      </div>
    </PageLayout>
  )
}

type KindChipProps = { label: string; count: number | undefined; active: boolean; onClick: () => void }

const KindChip = ({ label, count, active, onClick }: KindChipProps) => (
  <li>
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
        active ? 'border-link bg-link text-white' : 'border-rule bg-white text-body hover:border-link-line hover:text-link'
      }`}
    >
      {label}
      {count !== undefined && (
        <span
          className={`rounded-full px-1.5 font-mono text-[0.7rem] ${active ? 'bg-white/20 text-white' : 'bg-well text-muted'}`}
        >
          {count}
        </span>
      )}
    </button>
  </li>
)

const GuideCallout = () => (
  <aside className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-link-line/40 bg-gradient-to-r from-link-soft to-easy-soft p-5">
    <div className="flex items-center gap-4">
      <span className="flex size-11 items-center justify-center rounded-xl bg-white text-link shadow-card">
        <BookIcon className="size-5" />
      </span>
      <div>
        <p className="font-semibold text-ink">First time? Start with the guide.</p>
        <p className="text-sm text-muted">Six steps from picking an issue to opening your pull request.</p>
      </div>
    </div>
    <Link to="/guide" className={btnPrimary}>
      Read the guide
      <ArrowRightIcon />
    </Link>
  </aside>
)
