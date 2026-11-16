import { ArrowLeftIcon, ArrowRightIcon } from './icons'

type PaginationProps = {
  page: number
  pageSize: number
  total: number
  onPage: (page: number) => void
}

/** First, last, and the pages around the current one; gaps become "…". */
const pageList = (page: number, pages: number): (number | 'gap')[] => {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages))
  const sorted = [...keep].sort((a, b) => a - b)
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1] > 1 ? (['gap', p] as const) : [p]))
}

export const Pagination = ({ page, pageSize, total, onPage }: PaginationProps) => {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages === 1) return null

  const step =
    'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-body transition ' +
    'enabled:hover:bg-white enabled:hover:shadow-card disabled:text-muted/60'

  return (
    <nav aria-label="Pagination" className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-rule pt-6">
      <button type="button" className={step} disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ArrowLeftIcon />
        Previous
      </button>

      <ol className="hidden items-center gap-1 sm:flex">
        {pageList(page, pages).map((p, i) =>
          p === 'gap' ? (
            <li key={`gap-${i}`} aria-hidden="true" className="px-1 text-muted">
              …
            </li>
          ) : (
            <li key={p}>
              <button
                type="button"
                onClick={() => onPage(p)}
                aria-current={p === page ? 'page' : undefined}
                aria-label={`Page ${p}`}
                className={`min-w-9 rounded-lg px-2 py-1.5 text-sm font-semibold tabular-nums transition ${
                  p === page ? 'bg-link text-white' : 'bg-white text-body shadow-card hover:bg-link-soft'
                }`}
              >
                {p}
              </button>
            </li>
          ),
        )}
      </ol>

      <span className="text-sm text-muted sm:hidden">
        Page {page} of {pages}
      </span>

      <button type="button" className={step} disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
        <ArrowRightIcon />
      </button>
    </nav>
  )
}
