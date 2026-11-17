import type { components, operations } from './schema'

export type Issue = components['schemas']['IssueOut']
export type IssueDetail = components['schemas']['IssueDetail']
export type IssuePage = components['schemas']['IssuePage']
export type FilterMeta = components['schemas']['FilterMeta']
export type Stats = components['schemas']['Stats']
export type LevelSummary = components['schemas']['LevelSummary']
export type Me = components['schemas']['Me']
export type SavedIssue = components['schemas']['SavedIssueOut']
export type SavedStatus = SavedIssue['status']
export type RecommendedPage = components['schemas']['RecommendedPage']
export type SkillProfile = components['schemas']['SkillProfile']
export type ContributionCalendar = components['schemas']['ContributionCalendar']
export type ContributionDay = components['schemas']['ContributionDay']
export type IssueQuery = NonNullable<operations['list_issues_api_v1_issues_get']['parameters']['query']>
export type Difficulty = NonNullable<IssueQuery['difficulty']>[number]
export type SortKey = NonNullable<IssueQuery['sort']>
export type Level = NonNullable<IssueQuery['level']>
export type Kind = NonNullable<IssueQuery['kind']>

const BASE = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const toSearchParams = (query: Record<string, unknown>): URLSearchParams => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    // FastAPI reads lists as repeated keys: ?difficulty=easy&difficulty=medium
    const values = Array.isArray(value) ? value : [value]
    for (const v of values) params.append(key, String(v))
  }
  return params
}

const getJson = async <T>(path: string, query: Record<string, unknown> = {}): Promise<T> => {
  const qs = toSearchParams(query).toString()
  const response = await fetch(`${BASE}/api/v1${path}${qs ? `?${qs}` : ''}`)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new ApiError(response.status, body?.error?.message ?? `Request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

/** PUT/DELETE with a JSON body; the session cookie rides along (same origin). */
const send = async <T>(method: 'PUT' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T | null> => {
  const response = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new ApiError(response.status, data?.error?.message ?? `Request failed (${response.status})`)
  }
  return response.status === 204 ? null : (response.json() as Promise<T>)
}

/** A full-page navigation (not fetch): GitHub's sign-in page must open in the browser. */
export const signInUrl = (returnTo: string) =>
  `${BASE}/api/v1/auth/github/login?${new URLSearchParams({ next: returnTo })}`

export const api = {
  searchIssues: (query: IssueQuery) => getJson<IssuePage>('/issues', query),
  getIssue: (id: number) => getJson<IssueDetail>(`/issues/${id}`),
  filterMeta: () => getJson<FilterMeta>('/meta/filters'),
  stats: () => getJson<Stats>('/stats'),
  levels: () => getJson<LevelSummary[]>('/meta/levels'),
  /** The signed-in user, or null when signed out (the API answers 401). */
  me: async (): Promise<Me | null> => {
    try {
      return await getJson<Me>('/auth/me')
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null
      throw error
    }
  },
  saved: () => getJson<SavedIssue[]>('/me/saved'),
  /** Save an issue, or move it to another status. */
  setSaved: (issueId: number, status: SavedStatus) =>
    send<SavedIssue>('PUT', `/me/saved/${issueId}`, { status }) as Promise<SavedIssue>,
  unsave: (issueId: number) => send<null>('DELETE', `/me/saved/${issueId}`),
  recommended: (query: { level?: Level; page?: number }) => getJson<RecommendedPage>('/me/recommended', query),
  /** Re-read public repos and merged PRs on GitHub. */
  refreshProfile: () => send<SkillProfile>('POST', '/me/profile/refresh') as Promise<SkillProfile>,
  contributions: () => getJson<ContributionCalendar>('/me/contributions'),
  logout: async () => {
    await fetch(`${BASE}/api/v1/auth/logout`, { method: 'POST' })
  },
}
