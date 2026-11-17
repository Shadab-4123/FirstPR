import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import Markdown from 'react-markdown'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import remarkGfm from 'remark-gfm'

import { ApiError, api, type IssueDetail } from '../api/client'
import { DifficultyMeter } from '../components/DifficultyMeter'
import {
  AlertIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BookIcon,
  CheckIcon,
  ClockIcon,
  RepoIcon,
  StarIcon,
} from '../components/icons'
import { OpenOnGitHub } from '../components/OpenOnGitHub'
import { Notice } from '../components/ResultStates'
import { PageLayout } from '../components/SiteHeader'
import { TrackIssue } from '../components/TrackIssue'
import { btnPrimary, card, chip, eyebrow } from '../components/ui'
import { UNAVAILABLE_REASONS, authorRole, compactNumber, formatDate, pluralComments, timeAgo } from '../lib/format'

/** A one-page brief on an issue, so you can decide before diving into GitHub. */
export const IssuePage = () => {
  const id = Number(useParams().id)
  const issue = useQuery({
    queryKey: ['issue', id],
    queryFn: () => api.getIssue(id),
    enabled: Number.isInteger(id) && id > 0,
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 1,
  })

  return (
    <PageLayout>
      <BackLink />
      <div className="mt-4">
        {issue.isPending ? (
          <IssueSkeleton />
        ) : issue.isError ? (
          <IssueError error={issue.error} onRetry={() => issue.refetch()} />
        ) : (
          <IssueBrief issue={issue.data} />
        )}
      </div>
    </PageLayout>
  )
}

/** Back to the exact search you came from (filters and scroll), or to the start. */
const BackLink = () => {
  const navigate = useNavigate()
  const cameFromSearch = useLocation().state?.fromSearch === true
  const className = 'inline-flex items-center gap-1.5 text-sm font-semibold text-link hover:underline'
  return cameFromSearch ? (
    <button type="button" onClick={() => navigate(-1)} className={className}>
      ← Back to results
    </button>
  ) : (
    <Link to="/" className={className}>
      <ArrowLeftIcon /> Browse issues
    </Link>
  )
}

const IssueBrief = ({ issue }: { issue: IssueDetail }) => {
  const { repo, score_breakdown: scores } = issue
  const author = authorRole(issue.author_association)

  return (
    <article>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <a
          href={repo.html_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 font-mono text-sm text-link hover:underline"
        >
          <RepoIcon />
          {repo.full_name}
        </a>
        <p className="flex items-center gap-2 text-xs">
          {repo.language && (
            <span className={`${chip} inline-flex items-center gap-1.5`}>
              <span aria-hidden="true" className="size-2 rounded-full bg-link-line" />
              {repo.language}
            </span>
          )}
          <span className={`${chip} inline-flex items-center gap-1`}>
            <StarIcon className="size-3.5 text-medium-dot" />
            {compactNumber(repo.stars)}
            <span className="sr-only">stars</span>
          </span>
        </p>
      </div>
      <h1 className="mt-3 max-w-[40ch] text-3xl leading-tight font-bold tracking-tight text-pretty text-ink sm:text-4xl">
        {issue.title} <span className="font-normal text-muted">#{issue.number}</span>
      </h1>
      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        <span>
          Opened {timeAgo(issue.created_at)}
          {author && ` by ${author}`}
        </span>
        <span className="inline-flex items-center gap-1">
          <ClockIcon className="size-3.5" />
          last activity {timeAgo(issue.updated_at)}
        </span>
      </p>

      <AvailabilityNote issue={issue} />

      {/* Phones: actions, then the description, then the facts. Wide screens: description on the
          left; actions and facts stacked on the right. */}
      <div className="mt-6 grid items-start gap-6 lg:mt-8 lg:grid-cols-[1fr_20rem] lg:grid-rows-[auto_1fr]">
        <div className="space-y-5 lg:col-start-2 lg:row-start-1">
          <OpenOnGitHub url={issue.html_url} />
          <TrackIssue issueId={issue.id} />
        </div>

        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <section aria-labelledby="about" className={`${card} p-6 sm:p-8`}>
            <h2 id="about" className="text-2xl font-semibold text-ink">
              What this issue is about
            </h2>
            {issue.body.trim() ? (
              <IssueBody markdown={issue.body} />
            ) : (
              <p className="mt-4 text-muted">The author didn't write a description. The title is all there is.</p>
            )}
            {issue.body_truncated && (
              <p className="mt-6 border-l-[3px] border-link bg-well/60 px-3 py-2 text-sm text-muted">
                The description continues on GitHub.
              </p>
            )}
          </section>
          <NextSteps />
          <GuideCallout />
        </div>

        <aside aria-labelledby="glance" className={`${card} p-5 lg:col-start-2 lg:row-start-2`}>
          <h2 id="glance" className="font-semibold text-ink">
            Issue facts
          </h2>
          <dl className="mt-3 space-y-4">
            <Fact term="Raised">
              {formatDate(issue.created_at)} <span className="text-muted">({timeAgo(issue.created_at)})</span>
            </Fact>
            <Fact term="Discussion">{pluralComments(issue.comments_count)}</Fact>
            <Fact term="Estimated size">
              <DifficultyMeter label={issue.difficulty_label} reasons={scores.difficulty.reasons} />
              <Reasons items={scores.difficulty.reasons} />
              <ConfidenceNote difficulty={scores.difficulty} />
            </Fact>
            {scores.health.score !== null && (
              <Fact term="Repo health">
                <HealthBar score={scores.health.score} />
                <Points items={scores.health.reasons} />
              </Fact>
            )}
            {issue.labels.length > 0 && (
              <Fact term="Labels">
                <ul className="flex flex-wrap gap-1.5 pt-0.5">
                  {issue.labels.map((label) => (
                    <li key={label} className={`${chip} font-mono`}>
                      {label}
                    </li>
                  ))}
                </ul>
              </Fact>
            )}
          </dl>
          <p className="mt-5 border-t border-rule pt-4 text-xs leading-relaxed text-muted">
            Size is estimated from the issue text by a model trained on 2,633 past issues. On 658 newer ones it
            was right about 4 times in 10, and mixed up easy and hard about 1 time in 7.{' '}
            <a href={EVAL_URL} target="_blank" rel="noreferrer" className="underline">
              How it was tested
            </a>
            . Health comes from a simple formula. Treat both as hints, not promises.
          </p>
        </aside>
      </div>
    </article>
  )
}

const EVAL_URL = 'https://github.com/Shadab-4123/FirstPR/blob/main/ml/EVAL.md'

/** Numbers from ml/EVAL.md: right 61% of the time when confident, 38% otherwise. */
const ConfidenceNote = ({ difficulty }: { difficulty: IssueDetail['score_breakdown']['difficulty'] }) => {
  const note = (text: string) => <p className="mt-2 rounded-lg bg-well/70 px-2.5 py-1.5 text-xs text-muted">{text}</p>
  if (difficulty.method !== 'model_v1' || difficulty.confidence === null || difficulty.confidence === undefined) {
    return note("Rough guess from a simple formula. Our model hasn't scored this one yet.")
  }
  return difficulty.confidence >= 0.6
    ? note('Fairly confident: estimates like this are right about 6 times in 10.')
    : note('Low confidence: estimates like this are right about 4 times in 10.')
}

const AvailabilityNote = ({ issue }: { issue: IssueDetail }) => {
  const checked = issue.last_checked_at ? ` We last checked ${timeAgo(issue.last_checked_at)}.` : ''
  if (issue.is_available) {
    return (
      <div className="mt-6 flex gap-3 rounded-2xl border border-easy-line bg-easy-soft p-5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-easy-dot text-white">
          <CheckIcon />
        </span>
        <p className="text-sm text-body">
          <strong className="block text-base text-ink">Still open and unclaimed.</strong>
          Nobody is assigned, and there's no open pull request for it.{checked}
        </p>
      </div>
    )
  }
  const reason = UNAVAILABLE_REASONS[issue.unavailable_reason ?? ''] ?? 'Someone may already be working on it.'
  return (
    <div className="mt-6 flex gap-3 rounded-2xl border border-medium-line bg-medium-soft p-5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-medium-dot text-white">
        <AlertIcon />
      </span>
      <p className="text-sm text-body">
        <strong className="block text-base text-ink">Probably taken.</strong> {reason}
        {checked}
      </p>
    </div>
  )
}

const Fact = ({ term, children }: { term: string; children: ReactNode }) => (
  <div>
    <dt className="text-[0.7rem] font-semibold tracking-wider text-muted uppercase">{term}</dt>
    <dd className="mt-1 text-sm text-ink">{children}</dd>
  </div>
)

const Reasons = ({ items }: { items: string[] }) =>
  items.length > 0 && (
    <ul className="mt-1.5 space-y-0.5 text-xs text-muted">
      {items.map((reason) => (
        <li key={reason}>{reason}</li>
      ))}
    </ul>
  )

const HealthBar = ({ score }: { score: number }) => (
  <div className="flex items-center gap-3">
    <div className="h-2 flex-1 rounded-full bg-well" aria-hidden="true">
      <div className="h-2 rounded-full bg-easy" style={{ width: `${score}%` }} />
    </div>
    <span className="text-lg font-bold text-ink tabular-nums">
      {score}
      <span className="text-xs font-normal text-muted">/100</span>
    </span>
  </div>
)

/** "last push 9 days ago (+40)" → the reason on the left, its points on the right. */
const Points = ({ items }: { items: string[] }) => (
  <ul className="mt-2 space-y-1 text-xs">
    {items.map((reason) => {
      const match = reason.match(/^(.*) \((\+\d+)\)$/)
      return (
        <li key={reason} className="flex justify-between gap-3">
          <span className="text-body">{match ? match[1] : reason}</span>
          {match && <span className="font-mono text-easy">{match[2]}</span>}
        </li>
      )
    })}
  </ul>
)

const NEXT_STEPS = [
  ['Read the comments on GitHub', 'The plan may have changed since the issue was written.'],
  ['Look for a CONTRIBUTING file', 'It has the repo’s setup steps and style rules.'],
  ['Ask before you start', 'Comment that you’d like to work on it, and wait for a maintainer to say yes.'],
] as const

const NextSteps = () => (
  <section aria-labelledby="next" className={`${card} p-6`}>
    <h2 id="next" className="flex items-center gap-2 font-semibold text-ink">
      <BookIcon className="size-5 text-link" />
      Before you start coding
    </h2>
    <ol className="mt-4 grid gap-3 sm:grid-cols-3">
      {NEXT_STEPS.map(([title, text], i) => (
        <li key={title} className="rounded-xl bg-well/70 p-4">
          <span className="flex size-6 items-center justify-center rounded-full bg-link-soft text-xs font-semibold text-link">
            {i + 1}
          </span>
          <p className="mt-2 text-sm font-semibold text-ink">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{text}</p>
        </li>
      ))}
    </ol>
  </section>
)

const GuideCallout = () => (
  <aside className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-link-soft p-6">
    <div>
      <p className={eyebrow}>First pull request?</p>
      <p className="mt-1 font-semibold text-ink">Not sure about forks, branches or pull requests yet?</p>
      <p className="mt-1 text-sm text-muted">The guide walks through it in six short steps.</p>
    </div>
    <Link
      to="/guide"
      className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-link shadow-card hover:bg-white/80"
    >
      Read the guide
      <ArrowRightIcon />
    </Link>
  </aside>
)

/**
 * Issue text is written by anyone on GitHub, so it's rendered as markdown only:
 * react-markdown never runs raw HTML. Images are dropped (alt text kept) so a
 * brief stays light and doesn't load third-party trackers.
 */
const IssueBody = ({ markdown }: { markdown: string }) => (
  <div
    className="mt-5 max-w-[72ch] space-y-4 leading-relaxed break-words text-body
      [&_a]:text-link [&_a]:underline
      [&_blockquote]:border-l-2 [&_blockquote]:border-rule [&_blockquote]:pl-3 [&_blockquote]:text-muted
      [&_code]:rounded [&_code]:bg-link-soft [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.82em] [&_code]:text-link
      [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:text-ink
      [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink
      [&_h3]:font-semibold [&_h3]:text-ink [&_h4]:font-semibold
      [&_li]:mt-1 [&_li]:marker:text-link [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6
      [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-[#1e293b] [&_pre]:p-4 [&_pre]:text-white
      [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-white
      [&_table]:block [&_table]:overflow-x-auto [&_td]:border [&_td]:border-rule [&_td]:px-2
      [&_th]:border [&_th]:border-rule [&_th]:px-2"
  >
    <Markdown
      remarkPlugins={[remarkGfm]}
      disallowedElements={['img']}
      unwrapDisallowed
      components={{
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noreferrer nofollow">
            {children}
          </a>
        ),
      }}
    >
      {markdown}
    </Markdown>
  </div>
)

const IssueSkeleton = () => (
  <div aria-hidden="true" className="animate-pulse space-y-4">
    <div className="h-3.5 w-48 rounded-full bg-well" />
    <div className="h-9 w-3/4 rounded-full bg-well" />
    <div className="h-20 w-full rounded-2xl bg-easy-soft" />
    <div className={`${card} h-64 w-full`} />
  </div>
)

const IssueError = ({ error, onRetry }: { error: Error; onRetry: () => void }) => {
  const notFound = error instanceof ApiError && error.status === 404
  return (
    <Notice
      alert
      title={notFound ? "This issue isn't in FirstPR any more." : "This issue couldn't be loaded."}
      action={
        notFound ? (
          <Link to="/" className={btnPrimary}>
            Find another issue
          </Link>
        ) : (
          <button type="button" onClick={onRetry} className={btnPrimary}>
            Try again
          </button>
        )
      }
    >
      {notFound ? 'It may have been closed or deleted on GitHub.' : `${error.message} Try again in a moment.`}
    </Notice>
  )
}
