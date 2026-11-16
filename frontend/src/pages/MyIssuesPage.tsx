import { Link } from 'react-router'

import { signInUrl, type SavedIssue, type SavedStatus } from '../api/client'
import { SiteHeader } from '../components/SiteHeader'
import { timeAgo } from '../lib/format'
import { STATUSES, useMe, useSaved, useSavedActions } from '../lib/saved'

/** Your saved issues, grouped by how far you've got. */
export const MyIssuesPage = () => {
  const me = useMe()
  const saved = useSaved()

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 sm:px-8">
      <SiteHeader />
      <main className="pt-8 sm:pt-14">
        <h1 className="font-display text-3xl leading-tight font-semibold sm:text-4xl">My issues</h1>
        {me.isPending || (me.data && saved.isPending) ? (
          <ListSkeleton />
        ) : !me.data ? (
          <SignedOut />
        ) : saved.isError ? (
          <div role="alert" className="py-10">
            <p className="font-display text-xl font-medium">Your issues couldn't be loaded.</p>
            <p className="mt-2 text-muted">{saved.error.message}</p>
            <button
              type="button"
              onClick={() => saved.refetch()}
              className="mt-4 rounded-md bg-ink px-4 py-2 font-semibold text-white hover:bg-link"
            >
              Try again
            </button>
          </div>
        ) : !saved.data?.length ? (
          <Empty />
        ) : (
          <Groups items={saved.data} />
        )}
      </main>
    </div>
  )
}

const Groups = ({ items }: { items: SavedIssue[] }) => {
  const groups = STATUSES.map((status) => ({ ...status, items: items.filter((i) => i.status === status.value) }))
  return (
    <>
      <p className="mt-3 text-muted">
        {groups
          .filter((g) => g.items.length > 0)
          .map((g) => `${g.items.length} ${g.counted}`)
          .join(' · ')}
      </p>
      {groups
        .filter((g) => g.items.length > 0)
        .map((group) => (
          <section key={group.value} aria-labelledby={`group-${group.value}`} className="mt-10">
            <h2
              id={`group-${group.value}`}
              className="flex items-baseline gap-3 border-b-2 border-ink pb-2 font-display text-xl font-semibold"
            >
              {group.label}
              <span className="text-sm font-normal text-muted">{group.hint}</span>
            </h2>
            <ul>
              {group.items.map((item) => (
                <SavedRow key={item.issue.id} item={item} />
              ))}
            </ul>
          </section>
        ))}
    </>
  )
}

const SavedRow = ({ item }: { item: SavedIssue }) => {
  const { issue } = item
  const { setStatus, remove } = useSavedActions()
  const busy = setStatus.isPending || remove.isPending
  const note = statusNote(item)
  const error = setStatus.error ?? remove.error

  return (
    <li className="grid gap-3 border-b border-rule py-5 sm:grid-cols-[1fr_auto] sm:items-start sm:gap-8">
      <div className="min-w-0">
        <p className="text-sm text-muted">
          <span className="font-semibold text-ink">{issue.repo.full_name}</span>
          <span className="ml-2">#{issue.number}</span>
          <span className="ml-2">updated here {timeAgo(item.updated_at)}</span>
        </p>
        <h3 className="mt-1 font-display text-lg leading-snug font-medium text-pretty">
          <Link to={`/issues/${issue.id}`} className="hover:text-link hover:underline">
            {issue.title}
          </Link>
        </h3>
        {note && <p className="mt-1.5 text-sm text-medium">{note}</p>}
        {error && (
          <p role="alert" className="mt-1.5 text-sm text-hard">
            {error.message}
          </p>
        )}
      </div>
      <div className="flex items-center gap-4">
        <label className="text-sm">
          <span className="sr-only">Progress on {issue.title}</span>
          <select
            value={item.status}
            disabled={busy}
            onChange={(e) => setStatus.mutate({ issueId: issue.id, status: e.target.value as SavedStatus })}
            className="rounded-md border border-rule bg-white px-2.5 py-1.5 disabled:opacity-60"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <a href={issue.html_url} target="_blank" rel="noreferrer" className="text-sm text-link hover:underline">
          GitHub
        </a>
        <button
          type="button"
          onClick={() => remove.mutate(issue.id)}
          disabled={busy}
          className="text-sm text-muted hover:text-ink disabled:opacity-50"
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
  <div className="py-10">
    <p className="max-w-prose text-muted">
      Sign in to save issues and track each one from first look to merged pull request.
    </p>
    <a
      href={signInUrl('/my-issues')}
      className="mt-5 inline-block rounded-md bg-ink px-4 py-2 font-semibold text-white hover:bg-link"
    >
      Sign in with GitHub
    </a>
  </div>
)

const Empty = () => (
  <div className="py-10">
    <p className="font-display text-xl font-medium">Nothing saved yet.</p>
    <p className="mt-2 max-w-prose text-muted">
      Open any issue and press <strong>Save to My issues</strong>. Then mark it as you go: working on it, PR
      opened, merged.
    </p>
    <Link to="/explore" className="mt-5 inline-block rounded-md bg-ink px-4 py-2 font-semibold text-white hover:bg-link">
      Find an issue
    </Link>
  </div>
)

const ListSkeleton = () => (
  <div aria-hidden="true" className="mt-10 animate-pulse space-y-6">
    {[0, 1, 2].map((i) => (
      <div key={i} className="space-y-2">
        <div className="h-3.5 w-40 rounded bg-rule" />
        <div className="h-6 w-3/4 rounded bg-rule/70" />
      </div>
    ))}
  </div>
)
