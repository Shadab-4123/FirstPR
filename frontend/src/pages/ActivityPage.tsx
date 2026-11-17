import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'

import { ApiError, api, signInUrl, type ContributionCalendar } from '../api/client'
import { ContributionGraph } from '../components/ContributionGraph'
import { ExternalIcon } from '../components/icons'
import { Notice } from '../components/ResultStates'
import { PageLayout } from '../components/SiteHeader'
import { btnPrimary, btnSecondary, card, eyebrow } from '../components/ui'
import { activityStats, formatDay } from '../lib/contributions'
import { useMe } from '../lib/saved'

/** Your GitHub contribution graph, as on your GitHub profile, with a few numbers from it. */
export const ActivityPage = () => {
  const me = useMe()
  const calendar = useQuery({
    queryKey: ['contributions'],
    queryFn: api.contributions,
    enabled: Boolean(me.data),
    staleTime: 10 * 60_000,
    retry: (count, error) => !(error instanceof ApiError && error.status === 409) && count < 1,
  })

  return (
    <PageLayout>
      <p className={eyebrow}>
        <span aria-hidden="true" className="size-1.5 rounded-full bg-easy-dot" />
        From your GitHub profile
      </p>
      <h1 className="mt-2 text-3xl leading-tight font-bold tracking-tight text-ink sm:text-4xl">Your activity</h1>

      <div className="mt-6">
        {me.isPending ? (
          <GraphSkeleton />
        ) : !me.data ? (
          <Notice
            title="Sign in to see your contribution graph"
            action={
              <a href={signInUrl('/activity')} className={btnPrimary}>
                Sign in with GitHub
              </a>
            }
          >
            It's the same graph GitHub shows on your profile: every day of the last year, darker for busier days.
          </Notice>
        ) : calendar.isPending ? (
          <GraphSkeleton />
        ) : calendar.isError ? (
          <Notice
            alert
            title="Your activity couldn't be loaded."
            action={
              calendar.error instanceof ApiError && calendar.error.status === 409 ? (
                <a href={signInUrl('/activity')} className={btnPrimary}>
                  Sign in again
                </a>
              ) : (
                <button type="button" onClick={() => calendar.refetch()} className={btnPrimary}>
                  Try again
                </button>
              )
            }
          >
            {calendar.error.message}
          </Notice>
        ) : (
          <Activity calendar={calendar.data} login={me.data.login} avatar={me.data.avatar_url} />
        )}
      </div>
    </PageLayout>
  )
}

const Activity = ({ calendar, login, avatar }: { calendar: ContributionCalendar; login: string; avatar?: string | null }) => {
  const stats = activityStats(calendar.weeks)
  return (
    <>
      <section className={`${card} p-6 sm:p-8`} aria-labelledby="graph-title">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {avatar && <img src={avatar} alt="" className="size-12 rounded-full border border-rule" />}
            <div>
              <p className="font-mono text-sm text-link">{login}</p>
              <h2 id="graph-title" className="text-xl font-semibold text-ink">
                {calendar.total.toLocaleString()} contribution{calendar.total === 1 ? '' : 's'} in the last year
              </h2>
            </div>
          </div>
          <a href={`https://github.com/${login}`} target="_blank" rel="noreferrer" className={btnSecondary}>
            <ExternalIcon />
            Open your GitHub profile
          </a>
        </div>

        <div className="mt-2">
          <ContributionGraph weeks={calendar.weeks} />
        </div>
      </section>

      <dl className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat term="Days you contributed" value={stats.activeDays.toLocaleString()} note="in the last year" />
        <Stat term="Longest streak" value={days(stats.longestStreak)} note="days in a row" />
        <Stat term="Current streak" value={days(stats.currentStreak)} note={stats.currentStreak ? 'and counting' : 'start one today'} />
        <Stat
          term="Busiest day"
          value={stats.busiest ? stats.busiest.count.toLocaleString() : '–'}
          note={stats.busiest ? formatDay(stats.busiest.date) : 'no contributions yet'}
        />
      </dl>

      <p className="mt-6 rounded-2xl bg-link-soft p-5 text-sm leading-relaxed text-body">
        Commits, pull requests, issues and reviews all count, exactly as on GitHub. Private work shows only if you turned
        on "Include private contributions" in your GitHub profile settings. Your merged first PR will land here too:{' '}
        <Link to="/my-issues" className="font-semibold text-link underline">
          track it in My issues
        </Link>
        .
      </p>
    </>
  )
}

const days = (n: number) => n.toLocaleString()

const Stat = ({ term, value, note }: { term: string; value: string; note: string }) => (
  <div className={`${card} p-5`}>
    <dt className="text-xs font-semibold text-muted">{term}</dt>
    <dd className="mt-1 text-3xl font-bold text-ink tabular-nums">{value}</dd>
    <dd className="mt-0.5 text-xs text-muted">{note}</dd>
  </div>
)

const GraphSkeleton = () => <div aria-hidden="true" className={`${card} h-64 animate-pulse`} />
