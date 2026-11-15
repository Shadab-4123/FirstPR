import type { components, operations } from './schema'

export type Issue = components['schemas']['IssueOut']
export type IssueDetail = components['schemas']['IssueDetail']
export type IssuePage = components['schemas']['IssuePage']
export type FilterMeta = components['schemas']['FilterMeta']
export type Stats = components['schemas']['Stats']
export type IssueQuery = NonNullable<operations['list_issues_api_v1_issues_get']['parameters']['query']>
export type Difficulty = NonNullable<IssueQuery['difficulty']>[number]
export type SortKey = NonNullable<IssueQuery['sort']>

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

export const api = {
  searchIssues: (query: IssueQuery) => getJson<IssuePage>('/issues', query),
  getIssue: (id: number) => getJson<IssueDetail>(`/issues/${id}`),
  filterMeta: () => getJson<FilterMeta>('/meta/filters'),
  stats: () => getJson<Stats>('/stats'),
}
