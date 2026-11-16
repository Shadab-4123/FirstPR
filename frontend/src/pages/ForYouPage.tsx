import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'

import { api, signInUrl, type Level, type RecommendedPage, type SkillProfile } from '../api/client'
import { IssueRow } from '../components/IssueRow'
import { Pagination } from '../components/Pagination'
import { ErrorState, ResultsSkeleton } from '../components/ResultStates'
import { SiteHeader } from '../components/SiteHeader'
import { timeAgo } from '../lib/format'
import { LEVEL_INFO, LEVELS, isLevel } from '../lib/levels'
import { useMe } from '../lib/saved'

/** Open issues ranked by your languages and level, each saying why it's here. */
export const ForYouPage = () => {
  const me = useMe()
  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 sm:px-8">
      <SiteHeader />
      <main className="pt-8 sm:pt-14">
        <h1 className="font-display text-3xl leading-tight font-semibold sm:text-4xl">Picked for you</h1>
        {me.isPending ? <ResultsSkeleton /> : me.data ? <Recommendations /> : <SignedOut />}
      </main>
    </div>
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
      className="rounded-md border border-ink px-3 py-1 text-sm font-semibold hover:bg-ink hover:text-white disabled:opacity-50"
    >
      {refresh.isPending ? 'Reading GitHub…' : profile ? 'Refresh from GitHub' : 'Read my GitHub'}
    </button>
  )

  return (
    <section aria-label="What we know about you" className="mt-4 max-w-prose">
      {profile ? (
        <p className="text-muted">
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
          <span className="text-sm">Read {timeAgo(profile.updated_at)}.</span>
        </p>
      ) : (
        <p className="text-muted">
          We haven't read your GitHub yet. FirstPR looks at your public repos to see which languages you write, and
          counts pull requests merged in other projects to guess your level. Nothing private is read.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
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
  <fieldset className="mt-8">
    <legend className="text-sm font-semibold">Show issues for</legend>
    <div className="mt-2 flex flex-wrap gap-1.5">
      {LEVELS.map((lv) => (
        <label
          key={lv}
          className="cursor-pointer rounded-md border border-rule bg-white px-3 py-1.5 text-sm
            has-checked:border-ink has-checked:bg-ink has-checked:font-semibold has-checked:text-white
            has-focus-visible:outline-2 has-focus-visible:outline-link hover:border-ink"
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
          {lv === inferred && <span className="font-normal opacity-75"> · you</span>}
        </label>
      ))}
    </div>
  </fieldset>
)

const Results = ({ data, onPage }: { data: RecommendedPage; onPage: (page: number) => void }) =>
  data.items.length === 0 ? (
    <div className="py-10">
      <p className="font-display text-xl font-medium">No open, unclaimed issues right now.</p>
      <p className="mt-2 text-muted">New issues arrive with every daily sync. Check back tomorrow.</p>
    </div>
  ) : (
    <>
      <ul className="mt-6 border-t border-rule">
        {data.items.map((issue) => (
          <IssueRow
            key={issue.id}
            issue={issue}
            note={
              issue.match_reasons.length > 0 && (
                <p className="pt-1 text-sm text-easy">
                  <span className="sr-only">Why it's here: </span>
                  {issue.match_reasons.join(' · ')}
                </p>
              )
            }
          />
        ))}
      </ul>
      <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPage={onPage} />
      <p className="mt-8 max-w-prose text-xs leading-relaxed text-muted">
        How the order is decided: your language counts most, then whether the issue fits your level, then the
        repo's health and how recently the issue was active. Taken issues are left out.{' '}
        <Link to="/explore" className="underline">
          Browse by level instead
        </Link>
        .
      </p>
    </>
  )

const SignedOut = () => (
  <div className="py-6">
    <p className="max-w-prose text-muted">
      Sign in with GitHub and FirstPR will rank issues by the languages you write and how much open source
      you've done. It reads only public information.
    </p>
    <a
      href={signInUrl('/for-you')}
      className="mt-5 inline-block rounded-md bg-ink px-4 py-2 font-semibold text-white hover:bg-link"
    >
      Sign in with GitHub
    </a>
  </div>
)
