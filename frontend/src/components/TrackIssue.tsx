import { Link, useLocation } from 'react-router'

import { signInUrl } from '../api/client'
import { STATUSES, useMe, useSaved, useSavedActions } from '../lib/saved'
import { StatusPicker } from './StatusPicker'

/** On the issue page: save it to My issues, then mark how far you've got. */
export const TrackIssue = ({ issueId }: { issueId: number }) => {
  const me = useMe()
  const saved = useSaved()
  const { setStatus, remove } = useSavedActions()
  const location = useLocation()

  if (me.isPending || (me.data && saved.isPending)) return <div className="mt-4 h-10" aria-hidden="true" />
  if (!me.data) {
    return (
      <p className="mt-4 text-sm text-muted">
        <a href={signInUrl(location.pathname)} className="text-link underline">
          Sign in
        </a>{' '}
        to save this issue and track your progress.
      </p>
    )
  }

  const entry = saved.data?.find((s) => s.issue.id === issueId)
  const busy = setStatus.isPending || remove.isPending
  const error = setStatus.error ?? remove.error ?? saved.error

  return (
    <section aria-labelledby="track" className="mt-4">
      {entry ? (
        <>
          <div className="flex items-baseline justify-between">
            <h3 id="track" className="text-sm font-semibold">
              In{' '}
              <Link to="/my-issues" className="text-link underline">
                My issues
              </Link>
            </h3>
            <button
              type="button"
              onClick={() => remove.mutate(issueId)}
              disabled={busy}
              className="text-sm text-muted hover:text-ink disabled:opacity-50"
            >
              Remove
            </button>
          </div>
          <div className="mt-2">
            <StatusPicker
              name={`status-${issueId}`}
              value={entry.status}
              onChange={(status) => setStatus.mutate({ issueId, status })}
              disabled={busy}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted">{STATUSES.find((s) => s.value === entry.status)?.hint}</p>
        </>
      ) : (
        <>
          <h3 id="track" className="sr-only">
            Track this issue
          </h3>
          <button
            type="button"
            onClick={() => setStatus.mutate({ issueId, status: 'saved' })}
            disabled={busy}
            className="block w-full rounded-md border border-ink px-4 py-2.5 font-semibold hover:bg-ink hover:text-white disabled:opacity-50"
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
    </section>
  )
}
