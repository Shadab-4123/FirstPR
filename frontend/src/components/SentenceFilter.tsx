import { useEffect, useState } from 'react'

import type { Difficulty, FilterMeta } from '../api/client'
import type { IssueFilters } from '../hooks/useIssueFilters'
import { useDebouncedValue } from '../hooks/useDebouncedValue'

const STAR_OPTIONS = [0, 100, 1000, 10000]

type InlineSelectProps = {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; text: string }[]
}

/** A <select> styled as an underlined word inside the sentence. */
const InlineSelect = ({ label, value, onChange, options }: InlineSelectProps) => (
  <label className="relative inline-block">
    <span className="sr-only">{label}</span>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="cursor-pointer appearance-none [field-sizing:content] border-b-[3px] border-link bg-transparent pr-1 font-bold text-link hover:border-ink hover:text-ink"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.text}
        </option>
      ))}
    </select>
  </label>
)

type SentenceFilterProps = {
  filters: IssueFilters
  meta: FilterMeta | undefined
  onChange: (changes: Partial<IssueFilters>) => void
}

export const SentenceFilter = ({ filters, meta, onChange }: SentenceFilterProps) => {
  const [text, setText] = useState(filters.q)
  const debouncedText = useDebouncedValue(text, 300)

  useEffect(() => {
    if (debouncedText !== filters.q) onChange({ q: debouncedText })
    // Only react to the user's typing settling, not to every filters change.
  }, [debouncedText]) // eslint-disable-line react-hooks/exhaustive-deps

  const languages = [
    { value: '', text: 'any language' },
    ...(meta?.languages ?? []).map((l) => ({ value: l.value, text: l.value })),
  ]
  const difficulties = [
    { value: '', text: 'any size' },
    { value: 'easy', text: 'easy' },
    { value: 'medium', text: 'medium-sized' },
    { value: 'hard', text: 'harder' },
  ]
  const stars = STAR_OPTIONS.map((n) => ({
    value: String(n),
    text: n === 0 ? 'any number of' : `${n.toLocaleString()}+`,
  }))

  return (
    <section aria-label="Filter issues" className="space-y-6">
      <p className="font-display text-[clamp(1.75rem,4.5vw,3.25rem)] leading-[1.2] font-medium tracking-tight text-balance">
        Show me{' '}
        <InlineSelect
          label="Language"
          value={filters.language}
          options={languages}
          onChange={(language) => onChange({ language })}
        />{' '}
        issues that are{' '}
        <span className="whitespace-nowrap">
          <InlineSelect
            label="Difficulty"
            value={filters.difficulty}
            options={difficulties}
            onChange={(d) => onChange({ difficulty: d as Difficulty | '' })}
          />
          ,
        </span>{' '}
        from repos with{' '}
        <InlineSelect
          label="Minimum stars"
          value={String(filters.minStars)}
          options={stars}
          onChange={(s) => onChange({ minStars: Number(s) })}
        />{' '}
        stars.
      </p>

      <label className="block max-w-xl">
        <span className="mb-1.5 block text-sm text-muted">Search titles and descriptions</span>
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="docs typo, parser, CLI flag…"
          className="w-full rounded-md border border-rule bg-white px-3.5 py-2.5 text-base placeholder:text-muted/70"
        />
      </label>
    </section>
  )
}
