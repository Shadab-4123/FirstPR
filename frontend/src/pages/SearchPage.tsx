import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { api, type SortKey } from '../api/client'
import { ChevronDownIcon } from '../components/icons'
import { IssueRow } from '../components/IssueRow'
import { Pagination } from '../components/Pagination'
import { EmptyState, ErrorState, ResultsSkeleton } from '../components/ResultStates'
import { SentenceFilter } from '../components/SentenceFilter'
import { PageLayout } from '../components/SiteHeader'
import { PAGE_SIZE, useIssueFilters } from '../hooks/useIssueFilters'

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
    <PageLayout>
      <h1 className="sr-only">Find an open-source issue you can take</h1>
      <SentenceFilter key={resetKey} filters={filters} meta={meta.data} onChange={update} onReset={resetFilters} />

      <div className="mt-8 mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted" aria-live="polite">
          {issues.data &&
            (total === 0
              ? 'No matches'
              : `Showing ${first.toLocaleString()}–${Math.min(first + PAGE_SIZE - 1, total).toLocaleString()} of ${total.toLocaleString()}`)}
        </p>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">Sort by</span>
          <span className="relative inline-flex items-center">
            <select
              value={filters.sort}
              onChange={(e) => update({ sort: e.target.value as SortKey })}
              className="cursor-pointer appearance-none rounded-lg border border-rule bg-surface py-1.5 pr-8 pl-3 font-semibold text-body shadow-card"
            >
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-2 text-muted" />
          </span>
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
          <ul className={`space-y-4 transition-opacity ${issues.isPlaceholderData ? 'opacity-60' : ''}`}>
            {issues.data.items.map((issue) => (
              <IssueRow key={issue.id} issue={issue} />
            ))}
          </ul>
          <Pagination page={filters.page} pageSize={PAGE_SIZE} total={total} onPage={goToPage} />
        </>
      )}
    </PageLayout>
  )
}
