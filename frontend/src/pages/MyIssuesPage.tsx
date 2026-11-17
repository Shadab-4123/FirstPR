import { Link } from 'react-router'

import { signInUrl, type SavedIssue, type SavedStatus } from '../api/client'
import { AlertIcon, ExternalIcon } from '../components/icons'
import { Notice } from '../components/ResultStates'
import { PageLayout } from '../components/SiteHeader'
import { btnPrimary, card } from '../components/ui'
import { compactNumber, timeAgo } from '../lib/format'
import { STATUSES, useMe, useSaved, useSavedActions } from '../lib/saved'

/** Your saved issues, grouped by how far you've got. */
export const MyIssuesPage = () => {
  const me = useMe()
  const saved = useSaved()

  return (
    <PageLayout>
      <h1 className="text-3xl leading-tight font-bold tracking-tight text-ink sm:text-4xl">My issues</h1>
      {me.isPending || (me.data && saved.isPending) ? (
        <ListSkeleton />
      ) : !me.data ? (
        <SignedOut />
      ) : saved.isError ? (
        <div className="mt-6">
          <Notice
            alert
            title="Your issues couldn't be loaded."
            action={
              <button type="button" onClick={() => saved.refetch()} className={btnPrimary}>
                Try again
              </button>
            }
          >
            {saved.error.message}
          </Notice>
        </div>
      ) : !saved.data?.length ? (
        <Empty />
      ) : (
        <Groups items={saved.data} />
      )}
    </PageLayout>
  )
}

/** Column colours, in journey order. */
const COLUMN_LOOK: Record<SavedStatus, { dot: string; count: string; frame: string }> = {
  saved: { dot: 'bg-muted', count: 'bg-well text-body', frame: 'bg-well/50' },
  working: { dot: 'bg-accent', count: 'bg-link-soft text-link', frame: 'bg-link-soft/40' },
  pr_opened: { dot: 'bg-medium-dot', count: 'bg-medium-soft text-medium', frame: 'bg-medium-soft/50' },
  merged: { dot: 'bg-easy-dot', count: 'bg-easy-soft text-easy', frame: 'bg-easy-soft/50' },
}

const Groups = ({ items }: { items: SavedIssue[] }) => {
  const groups = STATUSES.map((status) => ({ ...status, items: items.filter((i) => i.status === status.value) }))
  return (
    <>
      <p className="mt-2 text-muted">
        {groups
          .filter((g) => g.items.length > 0)
          .map((g) => `${g.items.length} ${g.counted}`)
          .join(' · ')}
      </p>
      <div className="mt-8 grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {groups.map((group) => {
          const look = COLUMN_LOOK[group.value]
          return (
            <section
              key={group.value}
              aria-labelledby={`group-${group.value}`}
              className={`rounded-2xl p-3 ${look.frame}`}
            >
              <h2 id={`group-${group.value}`} className="flex items-center gap-2 px-2 pt-1 font-semibold text-ink">
                {group.label}
                <span aria-hidden="true" className={`size-2 rounded-full ${look.dot}`} />
                <span className={`ml-auto rounded-full px-2 text-xs font-semibold ${look.count}`}>
                  <span className="sr-only">(</span>
                  {group.items.length}
                  <span className="sr-only">)</span>
                </span>
              </h2>
              <p className="px-2 pb-3 text-xs text-muted">{group.hint}</p>
              {group.items.length === 0 ? (
                <p className="rounded-xl border border-dashed border-rule-strong px-3 py-6 text-center text-xs text-muted">
                  Nothing here yet
                </p>
              ) : (
                <ul className="space-y-3">
                  {group.items.map((item) => (
                    <SavedRow key={item.issue.id} item={item} />
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </>
  )
}

const SavedRow = ({ item }: { item: SavedIssue }) => {
  const { issue } = item
  const { setStatus, remove } = useSavedActions()
  const busy = setStatus.isPending || remove.isPending
  const note = statusNote(item)
  const error = setStatus.error ?? remove.error
  const merged = item.status === 'merged'

  return (
    <li className={`${card} p-4 ${merged ? 'border-easy-line' : ''}`}>
      <p className="truncate font-mono text-xs text-link" title={issue.repo.full_name}>
        {issue.repo.full_name}
      </p>
      <p className="mt-0.5 text-xs text-muted">
        ★ {compactNumber(issue.repo.stars)}
        {issue.repo.language && ` · ${issue.repo.language}`} · updated {timeAgo(item.updated_at)}
      </p>
      <h3 className="mt-2 leading-snug font-semibold text-pretty text-ink">
        <Link to={`/issues/${issue.id}`} className="hover:text-link hover:underline">
          {issue.title}
        </Link>{' '}
        <span className="text-sm font-normal text-muted">#{issue.number}</span>
      </h3>
      {note && (
        <p className="mt-2 flex gap-1.5 rounded-lg bg-medium-soft px-2.5 py-1.5 text-xs text-medium">
          <AlertIcon className="mt-px size-3.5" />
          <span>{note}</span>
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-hard">
          {error.message}
        </p>
      )}
      <label className="mt-3 flex items-center justify-between gap-2 text-xs text-muted">
        Move to
        <span className="sr-only"> (progress on {issue.title})</span>
        <select
          value={item.status}
          disabled={busy}
          onChange={(e) => setStatus.mutate({ issueId: issue.id, status: e.target.value as SavedStatus })}
          className="rounded-lg border border-rule bg-well/60 px-2 py-1 text-xs font-semibold text-body disabled:opacity-60"
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-3 flex items-center justify-between border-t border-rule pt-3 text-xs">
        <a href={issue.html_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-link hover:underline">
          <ExternalIcon className="size-3.5" />
          GitHub
        </a>
        <button
          type="button"
          onClick={() => remove.mutate(issue.id)}
          disabled={busy}
          className="text-muted hover:text-hard disabled:opacity-50"
        >
          Remove
        </button>
      </div>
    </li>
  )
}

/** What changed on GitHub that you may want to act on. */
const statusNote = ({ status, issue_state, issue }: SavedIssue): string | null => {
  const closed = issue_state !== 'open'
  if (closed && status === 'pr_opened') return 'Closed on GitHub. If your PR was merged, mark it Merged.'
  if (closed && status !== 'merged') return 'Closed on GitHub.'
  if (status === 'saved' && !issue.is_available) return 'Someone else may have picked this up.'
  return null
}

const SignedOut = () => (
  <div className="mt-6">
    <Notice
      title="Sign in to keep track of your issues"
      action={
        <a href={signInUrl('/my-issues')} className={btnPrimary}>
          Sign in with GitHub
        </a>
      }
    >
      Save issues and track each one from first look to merged pull request.
    </Notice>
  </div>
)

const Empty = () => (
  <div className="mt-6">
    <Notice
      title="Nothing saved yet."
      action={
        <Link to="/explore" className={btnPrimary}>
          Find an issue
        </Link>
      }
    >
      Open any issue and press <strong>Save to My issues</strong>. Then mark it as you go: working on it, PR opened,
      merged.
    </Notice>
  </div>
)

const ListSkeleton = () => (
  <div aria-hidden="true" className="mt-8 grid animate-pulse gap-4 sm:grid-cols-2 xl:grid-cols-4">
    {[0, 1, 2, 3].map((i) => (
      <div key={i} className="h-48 rounded-2xl bg-well" />
    ))}
  </div>
)
