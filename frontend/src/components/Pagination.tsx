type PaginationProps = {
  page: number
  pageSize: number
  total: number
  onPage: (page: number) => void
}

export const Pagination = ({ page, pageSize, total, onPage }: PaginationProps) => {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages === 1) return null

  const button = 'rounded-md border border-rule bg-white px-4 py-2 font-semibold disabled:opacity-40 enabled:hover:border-ink'

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4 pt-8">
      <button type="button" className={button} disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span className="text-sm text-muted">
        Page {page} of {pages}
      </span>
      <button type="button" className={button} disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </nav>
  )
}
