import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router'

import { api } from '../api/client'
import { timeAgo } from '../lib/format'
import { useMe, useSaved } from '../lib/saved'
import { AccountMenu } from './AccountMenu'
import { PullRequestIcon } from './icons'
import { pageWidth } from './ui'

const NAV = [
  { to: '/', label: 'Search', end: true },
  { to: '/explore', label: 'Explore by level', end: false },
  { to: '/guide', label: 'Your first PR', end: false },
]

const SIGNED_IN_NAV = [
  { to: '/for-you', label: 'For you', end: false },
  { to: '/my-issues', label: 'My issues', end: false },
  { to: '/activity', label: 'Activity', end: false },
]

const STATS_NAV = { to: '/stats', label: 'Stats', end: false }

const REPO_URL = 'https://github.com/Shadab-4123/FirstPR'

/** Header, data-freshness strip, the page itself, and the footer. */
export const PageLayout = ({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) => (
  <div className="flex min-h-screen flex-col">
    <SiteHeader />
    <main className={`${pageWidth} flex-1 pt-6 pb-20 sm:pt-10 ${narrow ? 'max-w-4xl' : ''}`}>{children}</main>
    <SiteFooter />
  </div>
)

export const SiteHeader = () => {
  const me = useMe()
  const saved = useSaved()
  const links = [...NAV, ...(me.data ? SIGNED_IN_NAV : []), STATS_NAV]
  const savedCount = saved.data?.length ?? 0

  return (
    <header>
      <div className="border-b border-rule bg-white">
        <div className={`${pageWidth} flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3`}>
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-link text-white">
              <PullRequestIcon className="size-[18px]" />
            </span>
            <span className="text-lg font-bold tracking-tight text-ink">FirstPR</span>
            <span className="hidden rounded-full bg-link-soft px-2 py-0.5 text-xs font-medium text-link md:inline">
              open source finder
            </span>
          </Link>
          <div className="order-last -mx-1 w-full overflow-x-auto lg:order-none lg:mx-0 lg:w-auto">
            <nav aria-label="Main">
              <ul className="flex gap-1 text-sm whitespace-nowrap">
                {links.map(({ to, label, end }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      end={end}
                      className={({ isActive }) =>
                        `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
                          isActive ? 'bg-link-soft font-semibold text-link' : 'text-body hover:bg-well'
                        }`
                      }
                    >
                      {label}
                      {to === '/my-issues' && savedCount > 0 && (
                        <span className="rounded-full bg-link-soft px-1.5 text-xs font-semibold text-link">
                          <span className="sr-only">(</span>
                          {savedCount}
                          <span className="sr-only"> saved)</span>
                        </span>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
          <AccountMenu />
        </div>
      </div>
      <FreshnessStrip />
    </header>
  )
}

/** "4,454 open issues in 2,463 repos, synced 11 hours ago": the index's size and age, on every page. */
const FreshnessStrip = () => {
  const stats = useQuery({ queryKey: ['stats'], queryFn: api.stats, staleTime: 60_000 })
  if (!stats.data) return <div className="h-8 border-b border-rule bg-well/60" aria-hidden="true" />
  const { issues_available, repos_indexed, last_sync } = stats.data
  return (
    <p className="flex h-8 items-center justify-center gap-1.5 border-b border-rule bg-well/60 px-4 text-xs text-muted">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-easy-dot" />
      <span className="truncate">
        {issues_available.toLocaleString()} open issues in {repos_indexed.toLocaleString()} repos
        {last_sync && `, synced ${timeAgo(last_sync.finished_at ?? last_sync.started_at)}`}
        {' · '}
        <Link to="/stats" className="font-medium text-link underline">
          Stats
        </Link>
      </span>
    </p>
  )
}

const SiteFooter = () => (
  <footer className="border-t border-rule bg-white">
    <div className={`${pageWidth} flex flex-wrap items-end justify-between gap-6 py-10`}>
      <div>
        <p className="font-bold text-ink">FirstPR</p>
        <p className="mt-1 max-w-sm text-sm text-muted">
          Honest, calm open source exploration for beginners. Made with care for new contributors.
        </p>
      </div>
      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <li>
          <Link to="/guide" className="text-body hover:text-link">
            Your first PR
          </Link>
        </li>
        <li>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="text-body hover:text-link">
            Source code
          </a>
        </li>
        <li>
          <a href={`${REPO_URL}/blob/main/ml/EVAL.md`} target="_blank" rel="noreferrer" className="text-body hover:text-link">
            How sizes are tested
          </a>
        </li>
      </ul>
    </div>
  </footer>
)
