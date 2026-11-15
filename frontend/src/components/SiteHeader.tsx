import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router'

import { AccountMenu } from './AccountMenu'

const NAV = [
  { to: '/', label: 'Search', end: true },
  { to: '/explore', label: 'Explore by level', end: false },
  { to: '/guide', label: 'Your first PR', end: false },
]

/** Brand, site navigation and account; `aside` is page-specific text such as sync freshness. */
export const SiteHeader = ({ aside }: { aside?: ReactNode }) => (
  <header className="py-6">
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
      <Link to="/" className="font-display text-xl font-bold tracking-tight">
        FirstPR
      </Link>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <nav aria-label="Main">
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {NAV.map(({ to, label, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    isActive
                      ? 'font-semibold text-ink underline decoration-2 underline-offset-4'
                      : 'text-muted hover:text-ink'
                  }
                >
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <AccountMenu />
      </div>
    </div>
    {aside && <p className="mt-2 text-sm text-muted">{aside}</p>}
  </header>
)
