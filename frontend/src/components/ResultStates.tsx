import type { ReactNode } from 'react'

import { btnPrimary, card } from './ui'

export const ResultsSkeleton = () => (
  <ul aria-hidden="true" className="animate-pulse space-y-4">
    {Array.from({ length: 4 }, (_, i) => (
      <li key={i} className={`${card} space-y-3 p-6`}>
        <div className="h-3 w-48 rounded-full bg-well" />
        <div className="h-5 w-3/4 rounded-full bg-well" />
        <div className="h-3 w-2/3 rounded-full bg-well/70" />
      </li>
    ))}
  </ul>
)

/** A friendly box for "nothing here" and "something broke", with one action. */
export const Notice = ({
  title,
  children,
  action,
  alert = false,
}: {
  title: string
  children?: ReactNode
  action?: ReactNode
  alert?: boolean
}) => (
  <div role={alert ? 'alert' : undefined} className={`${card} px-6 py-10 text-center sm:px-10`}>
    <p className="text-xl font-semibold text-ink">{title}</p>
    {children && <div className="mx-auto mt-2 max-w-prose text-muted">{children}</div>}
    {action && <div className="mt-5">{action}</div>}
  </div>
)

export const EmptyState = ({ onReset }: { onReset: () => void }) => (
  <Notice
    title="No open issues match all of that."
    action={
      <button type="button" onClick={onReset} className={btnPrimary}>
        Clear filters
      </button>
    }
  >
    Try a different language, any size, or fewer stars. Each one widens the search.
  </Notice>
)

export const ErrorState = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <Notice
    alert
    title="Issues couldn't be loaded."
    action={
      <button type="button" onClick={onRetry} className={btnPrimary}>
        Try again
      </button>
    }
  >
    {message} Check that the API is running, then try again.
  </Notice>
)
