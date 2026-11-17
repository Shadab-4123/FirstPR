import type { ReactNode } from 'react'

import type { Difficulty, FilterMeta } from '../api/client'
import { DIFFICULTY_OPTIONS, type FilterOption, STAR_OPTIONS, languageOptions } from '../lib/filterOptions'
import { ChevronDownIcon, CodeIcon, StarIcon } from './icons'

export type BarFilters = { language: string; difficulty: Difficulty | ''; minStars: number }

/** Language, Size and Stars as one bar: the obvious way to narrow a list of issues. */
export const FilterBar = ({
  filters,
  meta,
  onChange,
  className = '',
}: {
  filters: BarFilters
  meta: FilterMeta | undefined
  onChange: (changes: Partial<BarFilters>) => void
  className?: string
}) => (
  <div className={`grid grid-cols-3 gap-1 rounded-2xl bg-well p-1.5 ${className}`}>
    <FilterCell
      label="Language"
      icon={<CodeIcon />}
      value={filters.language}
      options={languageOptions(meta)}
      onChange={(language) => onChange({ language })}
    />
    <FilterCell
      label="Size"
      icon={<SizeDots difficulty={filters.difficulty} />}
      value={filters.difficulty}
      options={DIFFICULTY_OPTIONS}
      tone={filters.difficulty ? TONE[filters.difficulty] : undefined}
      onChange={(d) => onChange({ difficulty: d as Difficulty | '' })}
    />
    <FilterCell
      label="Stars"
      icon={<StarIcon />}
      value={String(filters.minStars)}
      options={STAR_OPTIONS}
      onChange={(v) => onChange({ minStars: Number(v) })}
    />
  </div>
)

/** A set filter's colours: indigo, or the difficulty's own colour for Size. */
const TONE = {
  link: { tile: 'bg-accent text-white', text: 'text-link' },
  easy: { tile: 'bg-easy-fill text-white', text: 'text-easy' },
  medium: { tile: 'bg-medium-fill text-white', text: 'text-medium' },
  hard: { tile: 'bg-hard-fill text-white', text: 'text-hard' },
}

/** One cell: icon, label and current value, with the real <select> laid invisibly over the
    whole cell so any click opens the browser's own picker. */
const FilterCell = ({
  label,
  icon,
  value,
  onChange,
  options,
  tone = TONE.link,
}: {
  label: string
  icon: ReactNode
  value: string
  onChange: (value: string) => void
  options: FilterOption[]
  tone?: { tile: string; text: string }
}) => {
  const chosen = value !== '' && value !== '0'
  const text = chosen ? (options.find((o) => o.value === value)?.text ?? value) : 'Any'
  return (
    <label
      className="group relative flex min-w-0 cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2.5 transition
        hover:bg-surface focus-within:bg-surface focus-within:ring-2 focus-within:ring-link sm:px-4"
    >
      <span
        aria-hidden="true"
        className={`hidden size-9 shrink-0 items-center justify-center rounded-lg sm:flex ${
          chosen ? tone.tile : 'bg-surface text-muted shadow-card'
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-0.5 text-xs text-muted">
          {label}
          <ChevronDownIcon className="size-3 sm:hidden" />
        </span>
        <span className={`block truncate text-sm font-semibold ${chosen ? tone.text : 'text-ink'}`}>{text}</span>
      </span>
      <ChevronDownIcon className="hidden size-4 text-muted transition group-hover:text-link sm:block" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${label} (short form)`}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.value === '' || o.value === '0' ? 'Any' : o.text}
          </option>
        ))}
      </select>
    </label>
  )
}

/** The difficulty badge's dots, so the Size filter looks like what it filters. */
const SizeDots = ({ difficulty }: { difficulty: string }) => {
  const filled = { easy: 1, medium: 2, hard: 3 }[difficulty] ?? 0
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3].map((i) => (
        <span key={i} className={`size-1.5 rounded-full bg-current ${i <= filled ? '' : 'opacity-30'}`} />
      ))}
    </span>
  )
}
