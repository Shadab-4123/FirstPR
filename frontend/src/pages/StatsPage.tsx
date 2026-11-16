import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { api, type Stats } from '../api/client'
import { ArrowRightIcon, ClockIcon } from '../components/icons'
import { Notice } from '../components/ResultStates'
import { PageLayout } from '../components/SiteHeader'
import { btnPrimary, card, eyebrow } from '../components/ui'
import { compactNumber, formatDate, timeAgo } from '../lib/format'
import { LEVEL_INFO, isLevel } from '../lib/levels'

const EVAL_URL = 'https://github.com/Shadab-4123/FirstPR/blob/main/ml/EVAL.md'

/** Public numbers: what's indexed, how fresh it is, and how good the size estimate is. */
export const StatsPage = () => {
  const stats = useQuery({ queryKey: ['stats'], queryFn: api.stats, staleTime: 60_000 })

  return (
    <PageLayout>
      <p className={eyebrow}>
        <span aria-hidden="true" className="size-1.5 rounded-full bg-easy-dot" />
        Public numbers
      </p>
      <h1 className="mt-2 text-3xl leading-tight font-bold tracking-tight text-ink sm:text-4xl">FirstPR in numbers</h1>
      <p className="mt-3 max-w-prose text-muted">
        What's in the index, how fresh it is, and how well the size estimate holds up on issues it never saw.
      </p>
      {stats.isPending ? (
        <div aria-hidden="true" className="mt-10 grid animate-pulse gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-2xl bg-well" />
          ))}
        </div>
      ) : stats.isError ? (
        <div className="mt-10">
          <Notice
            alert
            title="Stats couldn't be loaded."
            action={
              <button type="button" onClick={() => stats.refetch()} className={btnPrimary}>
                Try again
              </button>
            }
          />
        </div>
      ) : (
        <StatsBody stats={stats.data} />
      )}
    </PageLayout>
  )
}

const StatsBody = ({ stats }: { stats: Stats }) => {
  const hidden = (stats.hidden_by_reason ?? []).reduce((sum, r) => sum + r.count, 0)
  return (
    <>
      <dl className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Tile term="Free to pick up now" value={stats.issues_available} note="Open, unassigned, no PR" accent />
        <Tile term="Issues tracked" value={stats.issues_indexed} note="Everything in the index" />
        <Tile term="Repositories" value={stats.repos_indexed} note="In the index" />
        <Tile term="Hidden as taken or closed" value={hidden} note="Found by the daily re-check" />
      </dl>
      <Freshness stats={stats} />
      {stats.model && <ModelSection model={stats.model} scored={stats.model_scored ?? 0} available={stats.issues_available} />}
      <IndexSection stats={stats} />
      <section className="mt-8 flex flex-wrap items-center justify-between gap-6 rounded-2xl bg-link-soft p-6 sm:p-8">
        <div>
          <p className={eyebrow}>Check our work</p>
          <p className="mt-1 text-xl font-semibold text-ink">Read how the size estimate was tested</p>
          <p className="mt-1 max-w-prose text-sm text-muted">
            The evaluation explains the data, the time-based split, both baselines and where the model goes wrong.
          </p>
        </div>
        <a href={EVAL_URL} target="_blank" rel="noreferrer" className={btnPrimary}>
          Read the evaluation
          <ArrowRightIcon />
        </a>
      </section>
    </>
  )
}

const Tile = ({ term, value, note, accent = false }: { term: string; value: number; note: string; accent?: boolean }) => (
  <div className={`${card} p-5`}>
    <dt className="text-xs font-semibold tracking-wider text-muted uppercase">{term}</dt>
    <dd className={`mt-2 text-3xl font-bold tabular-nums sm:text-4xl ${accent ? 'text-easy' : 'text-ink'}`} title={value.toLocaleString()}>
      {value >= 10_000 ? compactNumber(value) : value.toLocaleString()}
    </dd>
    <dd className="mt-1 text-xs text-muted">{note}</dd>
  </div>
)

const Section = ({ id, title, label, children }: { id: string; title: string; label: string; children: ReactNode }) => (
  <section aria-labelledby={id} className={`${card} mt-8 p-6 sm:p-8`}>
    <p className={eyebrow}>{label}</p>
    <h2 id={id} className="mt-1 text-2xl font-semibold text-ink">
      {title}
    </h2>
    {children}
  </section>
)

const Freshness = ({ stats }: { stats: Stats }) => {
  const runs = stats.recent_runs ?? []
  const finished = (run: NonNullable<Stats['last_sync']>) => timeAgo(run.finished_at ?? run.started_at)
  return (
    <Section id="fresh" title="How fresh the data is" label="Sync log">
      <p className="mt-3 flex max-w-prose gap-2 text-body">
        <ClockIcon className="mt-1 size-4 text-link" />
        <span>
        {stats.last_sync ? <>New issues were last fetched {finished(stats.last_sync)}</> : 'No sync has finished yet'}
        {stats.last_recheck && <>, and stored issues were re-checked {finished(stats.last_recheck)}</>}.{' '}
        <span className="text-muted">
          Both run every day at 02:30 UTC. The re-check hides issues someone has claimed, been assigned or opened a
          pull request for.
        </span>
        </span>
      </p>
      {runs.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-xl border border-rule">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Recent runs, newest first</caption>
            <thead className="bg-well/70 text-xs tracking-wide text-muted uppercase">
              <tr>
                <th scope="col" className="py-2.5 pr-4 pl-4 font-semibold">Started</th>
                <th scope="col" className="py-2.5 pr-4 font-semibold">Job</th>
                <th scope="col" className="py-2.5 pr-4 font-semibold">Result</th>
                <th scope="col" className="py-2.5 pr-4 text-right font-semibold">Issues</th>
                <th scope="col" className="hidden py-2.5 pr-4 text-right font-semibold sm:table-cell">Took</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.started_at + run.kind} className="border-t border-rule">
                  <td className="py-2.5 pr-4 pl-4 font-mono text-xs whitespace-nowrap" title={new Date(run.started_at).toLocaleString()}>
                    {timeAgo(run.started_at)}
                  </td>
                  <td className="py-2.5 pr-4">{run.kind === 'recheck' ? 'Re-check' : 'Fetch new'}</td>
                  <td className="py-2.5 pr-4">
                    <RunStatus status={run.status} />
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">
                    {run.kind === 'recheck'
                      ? `${run.issues_seen?.toLocaleString()} checked, ${run.issues_upserted.toLocaleString()} changed`
                      : `${run.issues_upserted.toLocaleString()} saved`}
                  </td>
                  <td className="hidden py-2.5 pr-4 text-right tabular-nums sm:table-cell">{duration(run.started_at, run.finished_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}

/** Status is said in words, with color only as a second cue. */
const RunStatus = ({ status }: { status: string }) => {
  const look: Record<string, [string, string]> = {
    succeeded: ['✓ Succeeded', 'bg-easy-soft text-easy'],
    failed: ['✕ Failed', 'bg-hard-soft text-hard'],
    running: ['… Running', 'bg-well text-muted'],
  }
  const [label, color] = look[status] ?? [status, 'bg-well text-muted']
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${color}`}>{label}</span>
}

const duration = (start: string, end: string | null | undefined): string => {
  if (!end) return '–'
  const minutes = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000)
  return minutes < 1 ? '< 1 min' : minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

const pct = (x: number) => `${Math.round(x * 100)}%`

const ModelSection = ({
  model,
  scored,
  available,
}: {
  model: NonNullable<Stats['model']>
  scored: number
  available: number
}) => {
  const methods = [
    { name: 'Our model', scores: model.model, ours: true },
    { name: 'Simple formula (before the model)', scores: model.heuristic, ours: false },
    { name: `Always guess "${model.majority_predicts}"`, scores: model.majority, ours: false },
  ]
  return (
    <Section id="model" title="How good is the size estimate?" label="Tested on held-out issues">
      <p className="mt-3 max-w-prose text-body">
        Tested on {model.test_examples.toLocaleString()} real issues closed between{' '}
        {formatDate(model.test_period[0])} and {formatDate(model.test_period[1])}, all newer than anything the model
        learned from ({model.examples_used.toLocaleString()} issues in total). The answer for each was the size of
        the pull request that fixed it.
      </p>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <MetricBars
          title="Right size"
          note="Higher is better"
          rows={methods.map((m) => ({ label: m.name, value: m.scores.accuracy, strong: m.ours }))}
        />
        <MetricBars
          title="Balanced score (macro F1)"
          note="Higher is better; fair to all three sizes"
          rows={methods.map((m) => ({ label: m.name, value: m.scores.macro_f1, strong: m.ours }))}
        />
        <MetricBars
          title="Badly wrong"
          note="Lower is better: easy called hard, or hard called easy"
          rows={methods.map((m) => ({ label: m.name, value: m.scores.severe_error_rate, strong: m.ours }))}
        />
      </div>
      <p className="mt-6 rounded-xl bg-well/70 p-4 text-sm leading-relaxed text-body">
        When the model is confident (about {pct(model.share_confident)} of issues), it's right{' '}
        {pct(model.accuracy_when_confident)} of the time. It currently sizes {scored.toLocaleString()} of the{' '}
        {available.toLocaleString()} free issues; the rest use the simple formula until their full text is fetched.
        Trained {formatDate(model.trained_at)}.{' '}
        <a href={EVAL_URL} target="_blank" rel="noreferrer" className="text-link underline">
          Full evaluation
        </a>
        .
      </p>
    </Section>
  )
}

/** A few labelled bars on a fixed 0–100% scale, so lengths compare honestly. */
const MetricBars = ({
  title,
  note,
  rows,
}: {
  title: string
  note: string
  rows: { label: string; value: number; strong: boolean }[]
}) => (
  <figure className="rounded-xl border border-rule p-4">
    <figcaption>
      <span className="font-semibold text-ink">{title}</span>
      <span className="block text-xs text-muted">{note}</span>
    </figcaption>
    <ul className="mt-3 space-y-3">
      {rows.map((row) => (
        <li key={row.label} title={`${row.label}: ${pct(row.value)}`}>
          <div className="flex justify-between gap-3 text-sm">
            <span className={row.strong ? 'font-semibold text-link' : 'text-muted'}>{row.label}</span>
            <span className="font-semibold tabular-nums">{pct(row.value)}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-well">
            <div
              className={`h-2 rounded-full ${row.strong ? 'bg-link' : 'bg-muted/40'}`}
              style={{ width: `${Math.max(row.value * 100, 0.5)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  </figure>
)

const HIDDEN_LABELS: Record<string, string> = {
  closed: 'Closed on GitHub',
  assigned: 'Assigned to someone',
  linked_pr: 'Pull request already open',
  claimed_in_comments: 'Claimed in the comments',
  label_removed: 'Label removed',
}

const IndexSection = ({ stats }: { stats: Stats }) => (
  <Section id="index" title="What's in the index" label="Breakdown">
    <div className="mt-6 grid gap-4 md:grid-cols-3">
      <CountBars
        title="Free issues by level"
        rows={(stats.by_level ?? []).map((f) => ({
          label: isLevel(f.value) ? LEVEL_INFO[f.value].title : f.value,
          count: f.count,
        }))}
      />
      <CountBars title="Free issues by language" rows={(stats.by_language ?? []).map((f) => ({ label: f.value, count: f.count }))} />
      <CountBars
        title="Why issues are hidden"
        rows={(stats.hidden_by_reason ?? []).map((f) => ({ label: HIDDEN_LABELS[f.value] ?? f.value, count: f.count }))}
      />
    </div>
  </Section>
)

/** Counts as bars scaled to the largest row; the number is always printed. */
const CountBars = ({ title, rows }: { title: string; rows: { label: string; count: number }[] }) => {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <figure className="rounded-xl border border-rule p-4">
      <figcaption className="font-semibold text-ink">{title}</figcaption>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Nothing yet.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {rows.map((row) => (
            <li key={row.label} title={`${row.label}: ${row.count.toLocaleString()}`}>
              <div className="flex justify-between gap-3 text-sm">
                <span>{row.label}</span>
                <span className="tabular-nums text-muted">{row.count.toLocaleString()}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-well">
                <div className="h-2 rounded-full bg-link" style={{ width: `${(row.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </figure>
  )
}
