import type { ReactNode } from 'react'
import { Link } from 'react-router'

import type { Issue } from '../api/client'
import { compactNumber, plainText, pluralComments, timeAgo } from '../lib/format'
import { LEVEL_INFO } from '../lib/levels'
import { DifficultyMeter } from './DifficultyMeter'
import { CommentIcon, PulseIcon, RepoIcon, StarIcon } from './icons'
import { card, cardHover, chip } from './ui'

const MAX_LABELS = 4

/** One issue as an index card. `note` is an extra line under the labels, e.g. why it was recommended. */
export const IssueRow = ({ issue, note }: { issue: Issue; note?: ReactNode }) => {
  const { repo } = issue
  const { health } = issue.score_breakdown
  const extraLabels = issue.labels.length - MAX_LABELS

  return (
    <li className={`${card} ${cardHover} relative grid gap-4 p-5 sm:grid-cols-[1fr_10rem] sm:gap-8 sm:p-6`}>
      <div className="min-w-0 space-y-2.5">
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted">
          <a
            href={repo.html_url}
            target="_blank"
            rel="noreferrer"
            className="relative z-10 inline-flex items-center gap-1 font-mono text-[0.8rem] text-link hover:underline"
          >
            <RepoIcon className="size-3.5" />
            {repo.full_name}
          </a>
          <span className="inline-flex items-center gap-1">
            <StarIcon className="size-3.5 text-medium-dot" />
            {compactNumber(repo.stars)}
            <span className="sr-only">stars</span>
          </span>
          {repo.language && (
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true" className="size-2 rounded-full bg-link-line" />
              {repo.language}
            </span>
          )}
          {health.score !== null && (
            <span
              className="inline-flex items-center gap-1 rounded-md bg-easy-soft px-1.5 py-0.5 font-mono text-[0.7rem] text-easy"
              title={`Repo health, from: ${health.reasons.join('; ')}`}
            >
              <PulseIcon className="size-3" />
              Health {health.score}/100
            </span>
          )}
        </p>

        <h2 className="text-lg leading-snug font-semibold text-pretty text-ink">
          {/* fromSearch lets the brief's back link return to these exact results.
              The ::after makes the whole card clickable without nesting links. */}
          <Link
            to={`/issues/${issue.id}`}
            state={{ fromSearch: true }}
            className="hover:text-link after:absolute after:inset-0 after:rounded-2xl"
          >
            {issue.title}
          </Link>
        </h2>

        {issue.body_excerpt && (
          <p className="line-clamp-2 max-w-[75ch] text-sm leading-relaxed text-body/80">
            {plainText(issue.body_excerpt)}
          </p>
        )}

        <ul className="flex flex-wrap gap-1.5 pt-0.5" aria-label="Labels">
          {issue.labels.slice(0, MAX_LABELS).map((label) => (
            <li key={label} className={label === 'good first issue' ? `${chip} bg-link-soft text-link` : chip}>
              {label}
            </li>
          ))}
          {extraLabels > 0 && <li className="px-1 py-0.5 text-xs text-muted">+{extraLabels} more</li>}
        </ul>
        {note}
      </div>

      <div className="flex flex-row flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted sm:flex-col sm:items-end sm:text-right">
        <DifficultyMeter label={issue.difficulty_label} reasons={issue.score_breakdown.difficulty.reasons} />
        {issue.level && (
          <span className="rounded-md bg-well px-2 py-0.5 font-medium text-body">{LEVEL_INFO[issue.level].short}</span>
        )}
        <span>Updated {timeAgo(issue.updated_at)}</span>
        <span className="inline-flex items-center gap-1">
          <CommentIcon className="size-3.5" />
          {pluralComments(issue.comments_count)}
        </span>
      </div>
    </li>
  )
}
