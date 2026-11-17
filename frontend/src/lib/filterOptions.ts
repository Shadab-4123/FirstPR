import type { FilterMeta } from '../api/client'

/** Choices for the Language / Size / Stars filters, shared by the search sentence and the
    filter bar. The texts read inside the sentence ("Show me any language issues…"). */
export type FilterOption = { value: string; text: string }

export const languageOptions = (meta: FilterMeta | undefined): FilterOption[] => [
  { value: '', text: 'any language' },
  ...(meta?.languages ?? []).map((l) => ({ value: l.value, text: l.value })),
]

export const DIFFICULTY_OPTIONS: FilterOption[] = [
  { value: '', text: 'any size' },
  { value: 'easy', text: 'easy' },
  { value: 'medium', text: 'medium-sized' },
  { value: 'hard', text: 'harder' },
]

export const STAR_OPTIONS: FilterOption[] = [0, 100, 1000, 10000].map((n) => ({
  value: String(n),
  text: n === 0 ? 'any number of' : `${n.toLocaleString()}+`,
}))
