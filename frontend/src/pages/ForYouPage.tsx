import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'

import { api, signInUrl, type Level, type RecommendedPage, type SkillProfile } from '../api/client'
import { IssueRow } from '../components/IssueRow'
import { Pagination } from '../components/Pagination'
import { CheckCircleIcon, RefreshIcon } from '../components/icons'
import { ErrorState, Notice, ResultsSkeleton } from '../components/ResultStates'
import { PageLayout } from '../components/SiteHeader'
import { btnPrimary, btnSecondary, card, eyebrow } from '../components/ui'
import { timeAgo } from '../lib/format'
import { LEVEL_INFO, LEVELS, isLevel } from '../lib/levels'
import { useMe } from '../lib/saved'

/** Open issues ranked by your languages and level, each saying why it's here. */
export const ForYouPage = () => {
  const me = useMe()
  return (
    <PageLayout>
      <p className={eyebrow}>
        <span aria-hidden="true" className="size-1.5 rounded-full bg-easy-dot" />
        Based on your public GitHub
      </p>
      <h1 className="mt-2 text-3xl leading-tight font-bold tracking-tight text-ink sm:text-4xl">Picked for you</h1>
      <div className="mt-6">{me.isPending ? <ResultsSkeleton /> : me.data ? <Recommendations /> : <SignedOut />}</div>
    </PageLayout>
  )
}

const Recommendations = () => {
  const [params, setParams] = useSearchParams()
  const levelParam = params.get('level')
  const level = levelParam && isLevel(levelParam) ? levelParam : undefined // undefined: your inferred level
  const page = Math.max(1, Number(params.get('page')) || 1)

  const result = useQuery({
    queryKey: ['recommended', level ?? 'auto', page],
    queryFn: () => api.recommended({ level, page }),
    placeholderData: keepPreviousData,
  })

  const update = (next: { level?: Level; page?: number }) => {
    const p = new URLSearchParams(params)
    if (next.level) p.set('level', next.level)
    if (next.page && next.page > 1) p.set('page', String(next.page))
    else p.delete('page')
    setParams(p)
    window.scrollTo({ top: 0 })
  }

  if (result.isPending) return <ResultsSkeleton />
  if (result.isError) return <ErrorState message={result.error.message} onRetry={() => result.refetch()} />
  const data = result.data

  return (
    <>
      <ProfileNote profile={data.profile} />
      <LevelSwitch value={data.level} inferred={data.profile?.level} onChange={(lv) => update({ level: lv })} />
      <Results data={data} onPage={(p) => update({ level, page: p })} />
    </>
  )
}

/** Shows exactly what we guessed, so a wrong guess is visible and fixable. */
const ProfileNote = ({ profile }: { profile: SkillProfile | null }) => {
  const queryClient = useQueryClient()
  const refresh = useMutation({
    mutationFn: api.refreshProfile,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recommended'] }),
  })

  const button = (
    <button
      type="button"
      onClick={() => refresh.mutate()}
      disabled={refresh.isPending}
      className={profile ? btnSecondary : btnPrimary}
    >
      <RefreshIcon className={`size-4 ${refresh.isPending ? 'animate-spin' : ''}`} />
      {refresh.isPending ? 'Reading GitHub…' : profile ? 'Refresh from GitHub' : 'Read my GitHub'}
    </button>
  )

  return (
    <section
      aria-label="What we know about you"
      className={`${card} grid gap-6 border-t-4 border-t-link p-6 sm:p-8 md:grid-cols-[1fr_auto] md:items-start`}
    >
      <div className="max-w-prose">
      {profile ? (
        <p className="text-body">
          {profile.languages.length > 0 ? (
            <>
              From your {profile.repos_counted} public repos, you write{' '}
              {profile.languages.map((lang, i) => (
                <span key={lang.name}>
                  {i > 0 && (i === profile.languages.length - 1 ? ' and ' : ', ')}
                  <strong className="text-ink">{lang.name}</strong> ({Math.round(lang.share * 100)}%)
                </span>
              ))}
              .{' '}
            </>
          ) : (
            "We couldn't find a main language in your public repos, so language doesn't affect the order. "
          )}
          {profile.merged_prs === 0
            ? "We found no merged pull requests in other people's projects yet"
            : `You've had ${profile.merged_prs} pull request${profile.merged_prs === 1 ? '' : 's'} merged in other people's projects`}
          , so we start you at <strong className="text-ink">{LEVEL_INFO[profile.level].title.toLowerCase()}</strong>.{' '}
          <span className="text-sm text-muted">Read {timeAgo(profile.updated_at)}.</span>
        </p>
      ) : (
        <p className="text-body">
          We haven't read your GitHub yet. FirstPR looks at your public repos to see which languages you write, and
          counts pull requests merged in other projects to guess your level. Nothing private is read.
        </p>
      )}
        {profile && profile.languages.length > 0 && <LanguageBar languages={profile.languages} />}
      </div>
      <div className="flex flex-col items-start gap-2 md:items-end">
        {button}
        {refresh.isError && (
          <p role="alert" className="text-sm text-hard">
            {refresh.error.message}
          </p>
        )}
      </div>
    </section>
  )
}

const LevelSwitch = ({
  value,
  inferred,
  onChange,
}: {
  value: Level
  inferred?: Level
  onChange: (level: Level) => void
}) => (
  <fieldset className="mt-8 flex flex-wrap items-center gap-3">
    <legend className="float-left mr-1 text-xs font-semibold tracking-wider text-muted uppercase">Show issues for</legend>
    <div className="flex flex-wrap gap-1 rounded-xl bg-well p-1">
      {LEVELS.map((lv) => (
        <label
          key={lv}
          className="cursor-pointer rounded-lg px-3.5 py-1.5 text-sm text-body transition hover:text-link
            has-checked:bg-white has-checked:font-semibold has-checked:text-link has-checked:shadow-card
            has-focus-visible:outline-2 has-focus-visible:outline-link"
        >
          <input
            type="radio"
            name="level"
            value={lv}
            checked={value === lv}
            onChange={() => onChange(lv)}
            className="sr-only"
          />
          {LEVEL_INFO[lv].title}
          {lv === inferred && (
            <>
              <span className="sr-only"> · </span>
              <span className="ml-1.5 rounded-full bg-easy-soft px-1.5 text-xs font-semibold text-easy">you</span>
            </>
          )}
        </label>
      ))}
    </div>
  </fieldset>
)

const Results = ({ data, onPage }: { data: RecommendedPage; onPage: (page: number) => void }) =>
  data.items.length === 0 ? (
    <div className="mt-6">
      <Notice title="No open, unclaimed issues right now.">New issues arrive with every daily sync. Check back tomorrow.</Notice>
    </div>
  ) : (
    <>
      <ul className="mt-6 space-y-4">
        {data.items.map((issue) => (
          <IssueRow
            key={issue.id}
            issue={issue}
            note={
              issue.match_reasons.length > 0 && (
                <p className="flex items-start gap-2 rounded-lg bg-easy-soft px-3 py-2 text-xs font-medium text-easy">
                  <CheckCircleIcon className="mt-px size-3.5" />
                  <span className="sr-only">Why it's here: </span>
                  <span>{issue.match_reasons.join(' · ')}</span>
                </p>
              )
            }
          />
        ))}
      </ul>
      <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPage={onPage} />
      <p className="mt-8 rounded-2xl bg-link-soft p-5 text-sm leading-relaxed text-body">
        How the order is decided: your language counts most, then whether the issue fits your level, then the
        repo's health and how recently the issue was active. Taken issues are left out.{' '}
        <Link to="/explore" className="font-semibold text-link underline">
          Browse by level instead
        </Link>
        .
      </p>
    </>
  )

const SignedOut = () => (
  <Notice
    title="Sign in to see issues picked for you"
    action={
      <a href={signInUrl('/for-you')} className={btnPrimary}>
        Sign in with GitHub
      </a>
    }
  >
    FirstPR will rank issues by the languages you write and how much open source you've done. It reads only public
    information.
  </Notice>
)

const BAR_COLORS = ['bg-easy', 'bg-link', 'bg-link-line', 'bg-medium-dot', 'bg-muted']

/** The language shares as one stacked bar, with a legend that repeats the numbers. */
const LanguageBar = ({ languages }: { languages: SkillProfile['languages'] }) => (
  <div className="mt-5">
    <p className="text-xs font-semibold tracking-wider text-muted uppercase">Your languages</p>
    <div className="mt-2 flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
      {languages.map((lang, i) => (
        <div key={lang.name} className={BAR_COLORS[i % BAR_COLORS.length]} style={{ width: `${lang.share * 100}%` }} />
      ))}
    </div>
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-body">
      {languages.map((lang, i) => (
        <li key={lang.name} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={`size-2 rounded-full ${BAR_COLORS[i % BAR_COLORS.length]}`} />
          {lang.name} {Math.round(lang.share * 100)}%
        </li>
      ))}
    </ul>
  </div>
)
