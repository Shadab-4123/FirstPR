import { useSearchParams } from 'react-router'

import type { Difficulty, IssueQuery, SortKey } from '../api/client'

export const PAGE_SIZE = 20
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']
const SORTS: SortKey[] = ['relevance', 'newest', 'updated', 'stars']

export type IssueFilters = {
  language: string
  difficulty: Difficulty | ''
  minStars: number
  q: string
  sort: SortKey
  page: number
}

const toNumber = (raw: string | null, fallback: number) => {
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

const oneOf = <T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T =>
  allowed.includes(raw as T) ? (raw as T) : fallback

/** Filters live in the URL, so every search is shareable and survives a refresh. */
export const useIssueFilters = () => {
  const [params, setParams] = useSearchParams()

  const filters: IssueFilters = {
    language: params.get('language') ?? '',
    difficulty: oneOf(params.get('difficulty'), DIFFICULTIES, '' as Difficulty),
    minStars: toNumber(params.get('min_stars'), 0),
    q: params.get('q') ?? '',
    sort: oneOf(params.get('sort'), SORTS, 'relevance'),
    page: Math.max(1, toNumber(params.get('page'), 1)),
  }

  const update = (changes: Partial<IssueFilters>) => {
    const next = { ...filters, page: 1, ...changes } // any filter change returns to page 1
    const entries: [string, string][] = [
      ['language', next.language],
      ['difficulty', next.difficulty],
      ['min_stars', next.minStars ? String(next.minStars) : ''],
      ['q', next.q],
      ['sort', next.sort === 'relevance' ? '' : next.sort],
      ['page', next.page > 1 ? String(next.page) : ''],
    ]
    setParams(entries.filter(([, v]) => v !== ''), { replace: changes.page === undefined })
  }

  const query: IssueQuery = {
    language: filters.language || undefined,
    difficulty: filters.difficulty ? [filters.difficulty] : undefined,
    min_stars: filters.minStars || undefined,
    q: filters.q || undefined,
    sort: filters.sort,
    page: filters.page,
    page_size: PAGE_SIZE,
  }

  return { filters, query, update }
}
