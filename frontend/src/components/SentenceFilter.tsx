import { useEffect, useState } from 'react'

import type { Difficulty, FilterMeta } from '../api/client'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import type { IssueFilters } from '../hooks/useIssueFilters'
import { DIFFICULTY_OPTIONS, type FilterOption, STAR_OPTIONS, languageOptions } from '../lib/filterOptions'
import { FilterBar } from './FilterBar'
import { ChevronDownIcon, RefreshIcon, SearchIcon } from './icons'
import { card, eyebrow } from './ui'

/** One-click starting points: each is just a combination of the filters below. */
const PRESETS: { label: string; filters: Partial<IssueFilters> }[] = [
  { label: 'Python, easy', filters: { language: 'Python', difficulty: 'easy', minStars: 0 } },
  { label: 'TypeScript, easy', filters: { language: 'TypeScript', difficulty: 'easy', minStars: 0 } },
  { label: 'Rust, any size', filters: { language: 'Rust', difficulty: '', minStars: 0 } },
  { label: 'Popular repos (1,000+ stars)', filters: { language: '', difficulty: '', minStars: 1000 } },
]

type InlineSelectProps = {
  label: string
  value: string
  onChange: (value: string) => void
  options: FilterOption[]
}

/** A real <select>, styled as a tinted word inside the sentence. */
const InlineSelect = ({ label, value, onChange, options }: InlineSelectProps) => (
  <label className="relative inline-flex items-center">
    <span className="sr-only">{label}</span>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="cursor-pointer appearance-none [field-sizing:content] rounded-xl border-b-2 border-link-line bg-link-soft py-0.5 pr-9 pl-3
        font-semibold text-link transition hover:bg-[#e0e7ff]"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="text-base font-normal text-body">
          {o.text}
        </option>
      ))}
    </select>
    <ChevronDownIcon className="pointer-events-none absolute right-2.5 size-5 text-link" />
  </label>
)

type SentenceFilterProps = {
  filters: IssueFilters
  meta: FilterMeta | undefined
  onChange: (changes: Partial<IssueFilters>) => void
  onReset: () => void
}

export const SentenceFilter = ({ filters, meta, onChange, onReset }: SentenceFilterProps) => {
  const [text, setText] = useState(filters.q)
  const debouncedText = useDebouncedValue(text, 300)

  useEffect(() => {
    if (debouncedText !== filters.q) onChange({ q: debouncedText })
    // Only react to the user's typing settling, not to every filters change.
  }, [debouncedText]) // eslint-disable-line react-hooks/exhaustive-deps

  const languages = languageOptions(meta)
  const difficulties = DIFFICULTY_OPTIONS
  const stars = STAR_OPTIONS
  const filtered = Boolean(filters.language || filters.difficulty || filters.minStars || filters.q)

  return (
    <section aria-label="Filter issues" className="space-y-4">
      <div className={`${card} p-6 sm:p-10`}>
        <p className={eyebrow}>
          <span aria-hidden="true" className="size-1.5 rounded-full bg-easy-dot" />
          Find your first issue
        </p>
        <p className="mt-4 text-[clamp(1.5rem,3.6vw,2.4rem)] leading-[1.7] font-medium tracking-tight text-pretty text-ink">
          <span className="text-muted">Show me</span>{' '}
          <InlineSelect
            label="Language"
            value={filters.language}
            options={languages}
            onChange={(language) => onChange({ language })}
          />{' '}
          <span className="text-muted">issues that are</span>{' '}
          <span className="whitespace-nowrap">
            <InlineSelect
              label="Difficulty"
              value={filters.difficulty}
              options={difficulties}
              onChange={(d) => onChange({ difficulty: d as Difficulty | '' })}
            />
            <span className="text-muted">,</span>
          </span>{' '}
          <span className="text-muted">from repos with</span>{' '}
          <InlineSelect
            label="Minimum stars"
            value={String(filters.minStars)}
            options={stars}
            onChange={(s) => onChange({ minStars: Number(s) })}
          />{' '}
          <span className="text-muted">stars.</span>
        </p>

        {/* The same filters as one plain bar, so it's obvious they can be changed. */}
        <FilterBar filters={filters} meta={meta} onChange={onChange} className="mt-6 lg:max-w-3xl" />

        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-rule pt-5">
          <span className="mr-1 text-xs font-semibold text-muted">Quick presets:</span>
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => onChange(preset.filters)}
              className="rounded-full bg-well px-3 py-1 text-xs font-medium text-body transition hover:bg-link-soft hover:text-link"
            >
              {preset.label}
            </button>
          ))}
          {filtered && (
            <button
              type="button"
              onClick={onReset}
              className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-link hover:underline"
            >
              <RefreshIcon className="size-3.5" />
              Reset filters
            </button>
          )}
        </div>
      </div>

      <label className={`${card} flex items-center gap-3 px-4 py-1 focus-within:border-link focus-within:ring-4 focus-within:ring-link/10`}>
        <SearchIcon className="size-5 text-muted" />
        <span className="sr-only">Search titles and descriptions</span>
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search titles and descriptions: docs typo, parser, CLI flag…"
          className="w-full bg-transparent py-3 text-base text-ink placeholder:text-muted/80 focus:outline-none"
        />
      </label>
    </section>
  )
}
