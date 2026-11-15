import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { api, type SortKey } from '../api/client'
import { IssueRow } from '../components/IssueRow'
import { Pagination } from '../components/Pagination'
import { EmptyState, ErrorState, ResultsSkeleton } from '../components/ResultStates'
import { SentenceFilter } from '../components/SentenceFilter'
import { PAGE_SIZE, useIssueFilters } from '../hooks/useIssueFilters'
import { timeAgo } from '../lib/format'

const SORT_LABELS: Record<SortKey, string> = {
  relevance: 'Best match',
  newest: 'Newest',
  updated: 'Recently updated',
  stars: 'Most stars',
}

export const SearchPage = () => {
  const { filters, query, update } = useIssueFilters()
  const [resetKey, setResetKey] = useState(0)

  const meta = useQuery({ queryKey: ['meta'], queryFn: api.filterMeta, staleTime: 60_000 })
  const stats = useQuery({ queryKey: ['stats'], queryFn: api.stats, staleTime: 60_000 })
  const issues = useQuery({
    queryKey: ['issues', query],
    queryFn: () => api.searchIssues(query),
    placeholderData: keepPreviousData, // keep old results on screen while the next page loads
  })

  const resetFilters = () => {
    update({ language: '', difficulty: '', minStars: 0, q: '', sort: 'relevance' })
    setResetKey((k) => k + 1) // remounts the filter so its search box clears too
  }

  const goToPage = (page: number) => {
    update({ page })
    window.scrollTo({ top: 0 })
  }

  const total = issues.data?.total ?? 0
  const first = (filters.page - 1) * PAGE_SIZE + 1

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 sm:px-8">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-6">
        <span className="font-display text-xl font-bold tracking-tight">FirstPR</span>
        {stats.data && (
          <span className="text-sm text-muted">
            {stats.data.issues_available.toLocaleString()} open issues in{' '}
            {stats.data.repos_indexed.toLocaleString()} repos
            {stats.data.last_sync && `, synced ${timeAgo(stats.data.last_sync.started_at)}`}
          </span>
        )}
      </header>

      <main>
        <div className="pt-8 pb-12 sm:pt-14">
          <SentenceFilter key={resetKey} filters={filters} meta={meta.data} onChange={update} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink pb-3">
          <p className="text-sm text-muted" aria-live="polite">
            {issues.data &&
              (total === 0
                ? 'No matches'
                : `Showing ${first.toLocaleString()}–${Math.min(first + PAGE_SIZE - 1, total).toLocaleString()} of ${total.toLocaleString()}`)}
          </p>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted">Sort by</span>
            <select
              value={filters.sort}
              onChange={(e) => update({ sort: e.target.value as SortKey })}
              className="rounded-md border border-rule bg-white px-2 py-1.5"
            >
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {issues.isPending ? (
          <ResultsSkeleton />
        ) : issues.isError ? (
          <ErrorState message={issues.error.message} onRetry={() => issues.refetch()} />
        ) : total === 0 ? (
          <EmptyState onReset={resetFilters} />
        ) : (
          <>
            <ul className={issues.isPlaceholderData ? 'opacity-60' : undefined}>
              {issues.data.items.map((issue) => (
                <IssueRow key={issue.id} issue={issue} />
              ))}
            </ul>
            <Pagination page={filters.page} pageSize={PAGE_SIZE} total={total} onPage={goToPage} />
          </>
        )}
      </main>
    </div>
  )
}
