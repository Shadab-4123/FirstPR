import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'

import { signInUrl } from '../api/client'
import { useMe, useSaved, useSavedActions } from '../lib/saved'
import { CheckCircleIcon } from './icons'
import { StatusPicker } from './StatusPicker'
import { btnSecondary, card } from './ui'

/** On the issue page: save it to My issues, then mark how far you've got. */
export const TrackIssue = ({ issueId }: { issueId: number }) => {
  const me = useMe()
  const saved = useSaved()
  const { setStatus, remove } = useSavedActions()
  const location = useLocation()

  const frame = (body: ReactNode) => (
    <section aria-labelledby="track" className={`${card} p-5`}>
      <h2 id="track" className="flex items-center gap-2 font-semibold text-ink">
        <CheckCircleIcon className="size-5 text-link" />
        Track this issue
      </h2>
      {body}
    </section>
  )

  if (me.isPending || (me.data && saved.isPending)) return <div className={`${card} h-24`} aria-hidden="true" />
  if (!me.data) {
    return frame(
      <p className="mt-2 text-sm text-muted">
        <a href={signInUrl(location.pathname)} className="font-semibold text-link underline">
          Sign in
        </a>{' '}
        to save this issue and track your progress.
      </p>,
    )
  }

  const entry = saved.data?.find((s) => s.issue.id === issueId)
  const busy = setStatus.isPending || remove.isPending
  const error = setStatus.error ?? remove.error ?? saved.error

  return frame(
    <>
      {entry ? (
        <>
          <p className="mt-1 mb-4 text-sm text-muted">
            Saved in{' '}
            <Link to="/my-issues" className="font-semibold text-link underline">
              My issues
            </Link>
            . Mark it as you go.
          </p>
          <StatusPicker
            name={`status-${issueId}`}
            value={entry.status}
            onChange={(status) => setStatus.mutate({ issueId, status })}
            disabled={busy}
          />
          <button
            type="button"
            onClick={() => remove.mutate(issueId)}
            disabled={busy}
            className="mt-3 text-xs font-semibold text-hard hover:underline disabled:opacity-50"
          >
            Remove
          </button>
        </>
      ) : (
        <>
          <p className="mt-1 mb-4 text-sm text-muted">Keep it in My issues and mark your progress: working on it, PR opened, merged.</p>
          <button
            type="button"
            onClick={() => setStatus.mutate({ issueId, status: 'saved' })}
            disabled={busy}
            className={`${btnSecondary} w-full`}
          >
            {setStatus.isPending ? 'Saving…' : 'Save to My issues'}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-hard">
          {error.message}
        </p>
      )}
    </>,
  )
}
