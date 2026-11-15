import { Link } from 'react-router'

import type { Issue } from '../api/client'
import { compactNumber, plainText, pluralComments, timeAgo } from '../lib/format'
import { DifficultyMeter } from './DifficultyMeter'

const MAX_LABELS = 4

export const IssueRow = ({ issue }: { issue: Issue }) => {
  const { repo } = issue
  const { health } = issue.score_breakdown
  const extraLabels = issue.labels.length - MAX_LABELS

  return (
    <li className="grid gap-2 border-b border-rule py-6 sm:grid-cols-[1fr_9rem] sm:gap-8">
      <div className="min-w-0 space-y-2">
        <p className="text-sm text-muted">
          <a href={repo.html_url} target="_blank" rel="noreferrer" className="font-semibold text-ink hover:underline">
            {repo.full_name}
          </a>
          <span className="ml-2">{compactNumber(repo.stars)} stars</span>
          {repo.language && <span className="ml-2">{repo.language}</span>}
          {health.score !== null && (
            <span className="ml-2" title={`Repo health, from: ${health.reasons.join('; ')}`}>
              Health {health.score}/100
            </span>
          )}
        </p>

        <h2 className="font-display text-xl leading-snug font-medium text-pretty">
          {/* fromSearch lets the brief's back link return to these exact results */}
          <Link to={`/issues/${issue.id}`} state={{ fromSearch: true }} className="hover:text-link hover:underline">
            {issue.title}
          </Link>
        </h2>

        {issue.body_excerpt && (
          <p className="line-clamp-2 max-w-[70ch] text-[0.95rem] leading-relaxed text-muted">
            {plainText(issue.body_excerpt)}
          </p>
        )}

        <ul className="flex flex-wrap gap-1.5 pt-1" aria-label="Labels">
          {issue.labels.slice(0, MAX_LABELS).map((label) => (
            <li key={label} className="rounded-full border border-rule bg-white px-2.5 py-0.5 text-xs text-ink">
              {label}
            </li>
          ))}
          {extraLabels > 0 && <li className="px-1 py-0.5 text-xs text-muted">+{extraLabels} more</li>}
        </ul>
      </div>

      <div className="flex flex-row flex-wrap items-center gap-x-5 gap-y-1 sm:flex-col sm:items-start sm:gap-2 sm:pt-6">
        <DifficultyMeter
          label={issue.difficulty_label}
          reasons={issue.score_breakdown.difficulty.reasons}
        />
        <span className="text-sm text-muted">Updated {timeAgo(issue.updated_at)}</span>
        <span className="text-sm text-muted">
          {pluralComments(issue.comments_count)}
        </span>
      </div>
    </li>
  )
}
