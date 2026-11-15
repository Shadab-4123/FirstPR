import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import Markdown from 'react-markdown'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import remarkGfm from 'remark-gfm'

import { ApiError, api, type IssueDetail } from '../api/client'
import { DifficultyMeter } from '../components/DifficultyMeter'
import { SiteHeader } from '../components/SiteHeader'
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
    <div className="mx-auto max-w-5xl px-4 pb-24 sm:px-8">
      <SiteHeader />

      <main className="pt-2 sm:pt-4">
        <BackLink />
        <div className="mt-6">
          {issue.isPending ? (
            <IssueSkeleton />
          ) : issue.isError ? (
            <IssueError error={issue.error} onRetry={() => issue.refetch()} />
          ) : (
            <IssueBrief issue={issue.data} />
          )}
        </div>
      </main>
    </div>
  )
}

/** Back to the exact search you came from (filters and scroll), or to the start. */
const BackLink = () => {
  const navigate = useNavigate()
  const cameFromSearch = useLocation().state?.fromSearch === true
  const className = 'text-sm text-link hover:underline'
  return cameFromSearch ? (
    <button type="button" onClick={() => navigate(-1)} className={className}>
      ← Back to results
    </button>
  ) : (
    <Link to="/" className={className}>
      ← Browse issues
    </Link>
  )
}

const IssueBrief = ({ issue }: { issue: IssueDetail }) => {
  const { repo, score_breakdown: scores } = issue
  const author = authorRole(issue.author_association)

  return (
    <article>
      <p className="text-sm text-muted">
        <a href={repo.html_url} target="_blank" rel="noreferrer" className="font-semibold text-ink hover:underline">
          {repo.full_name}
        </a>
        {repo.language && <span className="ml-2">{repo.language}</span>}
        <span className="ml-2">{compactNumber(repo.stars)} stars</span>
      </p>
      <h1 className="mt-2 max-w-[38ch] font-display text-3xl leading-tight font-semibold text-pretty sm:text-4xl">
        {issue.title} <span className="font-normal text-muted">#{issue.number}</span>
      </h1>
      <p className="mt-3 text-muted">
        Opened {timeAgo(issue.created_at)}
        {author && ` by ${author}`} · last activity {timeAgo(issue.updated_at)}
      </p>

      <AvailabilityNote issue={issue} />

      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_18rem]">
        <section aria-labelledby="about">
          <h2 id="about" className="border-b-2 border-ink pb-2 font-display text-xl font-semibold">
            What this issue is about
          </h2>
          {issue.body.trim() ? (
            <IssueBody markdown={issue.body} />
          ) : (
            <p className="mt-4 text-muted">The author didn't write a description. The title is all there is.</p>
          )}
          {issue.body_truncated && (
            <p className="mt-6 border-l-2 border-rule pl-3 text-sm text-muted">
              The description continues on GitHub.
            </p>
          )}
        </section>

        <aside aria-labelledby="glance" className="lg:pt-1">
          <h2 id="glance" className="sr-only">
            At a glance
          </h2>
          <dl className="divide-y divide-rule border-y border-rule">
            <Fact term="Raised">
              {formatDate(issue.created_at)}
              <span className="block text-sm text-muted">{timeAgo(issue.created_at)}</span>
            </Fact>
            <Fact term="Discussion">{pluralComments(issue.comments_count)}</Fact>
            <Fact term="Estimated size">
              <DifficultyMeter label={issue.difficulty_label} reasons={scores.difficulty.reasons} />
              <Reasons items={scores.difficulty.reasons} />
              <ConfidenceNote difficulty={scores.difficulty} />
            </Fact>
            {scores.health.score !== null && (
              <Fact term="Repo health">
                <span className="font-semibold">{scores.health.score}/100</span>
                <Reasons items={scores.health.reasons} />
              </Fact>
            )}
            {issue.labels.length > 0 && (
              <Fact term="Labels">
                <ul className="flex flex-wrap gap-1.5 pt-0.5">
                  {issue.labels.map((label) => (
                    <li key={label} className="rounded-full border border-rule bg-white px-2.5 py-0.5 text-xs">
                      {label}
                    </li>
                  ))}
                </ul>
              </Fact>
            )}
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Size is estimated from the issue text by a model trained on 3,291 past issues. It's right about 4
            times in 10, and rarely mistakes a hard issue for an easy one.{' '}
            <a href={EVAL_URL} target="_blank" rel="noreferrer" className="underline">
              How it was tested
            </a>
            . Health comes from a simple formula. Treat both as hints, not promises.
          </p>

          <a
            href={issue.html_url}
            target="_blank"
            rel="noreferrer"
            className="mt-8 block rounded-md bg-ink px-4 py-3 text-center font-semibold text-white hover:bg-link"
          >
            Open on GitHub
          </a>
          <NextSteps />
        </aside>
      </div>
    </article>
  )
}

const EVAL_URL = 'https://github.com/Shadab-4123/FirstPR/blob/main/ml/EVAL.md'

/** Numbers from ml/EVAL.md: right 61% of the time when confident, 38% otherwise. */
const ConfidenceNote = ({ difficulty }: { difficulty: IssueDetail['score_breakdown']['difficulty'] }) => {
  if (difficulty.method !== 'model_v1' || difficulty.confidence === null || difficulty.confidence === undefined) {
    return <p className="mt-1.5 text-xs text-muted">Rough guess from a simple formula. Our model hasn't scored this one yet.</p>
  }
  return difficulty.confidence >= 0.6 ? (
    <p className="mt-1.5 text-xs text-muted">Fairly confident: estimates like this are right about 6 times in 10.</p>
  ) : (
    <p className="mt-1.5 text-xs text-muted">Low confidence: estimates like this are right about 4 times in 10.</p>
  )
}

const AvailabilityNote = ({ issue }: { issue: IssueDetail }) => {
  const checked = issue.last_checked_at ? ` We last checked ${timeAgo(issue.last_checked_at)}.` : ''
  if (issue.is_available) {
    return (
      <p className="mt-6 rounded-md border border-easy/30 bg-easy/8 px-4 py-3 text-sm">
        <strong className="text-easy">Still open and unclaimed.</strong> Nobody is assigned, and there's no
        open pull request for it.{checked}
      </p>
    )
  }
  const reason = UNAVAILABLE_REASONS[issue.unavailable_reason ?? ''] ?? 'Someone may already be working on it.'
  return (
    <p className="mt-6 rounded-md border border-medium/30 bg-medium/8 px-4 py-3 text-sm">
      <strong className="text-medium">Probably taken.</strong> {reason}
      {checked}
    </p>
  )
}

const Fact = ({ term, children }: { term: string; children: ReactNode }) => (
  <div className="py-3">
    <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{term}</dt>
    <dd className="mt-1">{children}</dd>
  </div>
)

const Reasons = ({ items }: { items: string[] }) =>
  items.length > 0 && (
    <ul className="mt-1.5 space-y-0.5 text-sm text-muted">
      {items.map((reason) => (
        <li key={reason}>{reason}</li>
      ))}
    </ul>
  )

const NextSteps = () => (
  <section aria-labelledby="next" className="mt-6">
    <h3 id="next" className="text-sm font-semibold">
      Before you start coding
    </h3>
    <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-muted">
      <li>Read the comments on GitHub: the plan may have changed since the issue was written.</li>
      <li>Look for a CONTRIBUTING file in the repo for setup and style rules.</li>
      <li>Comment that you'd like to work on it, and wait for a maintainer to say yes.</li>
    </ol>
  </section>
)

/**
 * Issue text is written by anyone on GitHub, so it's rendered as markdown only:
 * react-markdown never runs raw HTML. Images are dropped (alt text kept) so a
 * brief stays light and doesn't load third-party trackers.
 */
const IssueBody = ({ markdown }: { markdown: string }) => (
  <div
    className="mt-4 max-w-[70ch] space-y-4 leading-relaxed break-words
      [&_a]:text-link [&_a]:underline
      [&_blockquote]:border-l-2 [&_blockquote]:border-rule [&_blockquote]:pl-3 [&_blockquote]:text-muted
      [&_code]:rounded [&_code]:bg-white [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.9em]
      [&_h1]:font-display [&_h1]:text-lg [&_h1]:font-semibold
      [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold
      [&_h3]:font-semibold [&_h4]:font-semibold
      [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6
      [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-rule [&_pre]:bg-white [&_pre]:p-3
      [&_pre_code]:bg-transparent [&_pre_code]:p-0
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
    <div className="h-3.5 w-48 rounded bg-rule" />
    <div className="h-9 w-3/4 rounded bg-rule" />
    <div className="h-12 w-full rounded bg-rule/70" />
    <div className="h-40 w-full rounded bg-rule/50" />
  </div>
)

const IssueError = ({ error, onRetry }: { error: Error; onRetry: () => void }) => {
  const notFound = error instanceof ApiError && error.status === 404
  return (
    <div role="alert" className="py-10">
      <p className="font-display text-2xl font-medium">
        {notFound ? "This issue isn't in FirstPR any more." : "This issue couldn't be loaded."}
      </p>
      <p className="mt-2 max-w-prose text-muted">
        {notFound ? 'It may have been closed or deleted on GitHub.' : `${error.message} Try again in a moment.`}
      </p>
      {notFound ? (
        <Link to="/" className="mt-5 inline-block rounded-md bg-ink px-4 py-2 font-semibold text-white hover:bg-link">
          Find another issue
        </Link>
      ) : (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 rounded-md bg-ink px-4 py-2 font-semibold text-white hover:bg-link"
        >
          Try again
        </button>
      )}
    </div>
  )
}
