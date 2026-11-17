import type { Kind, Level } from '../api/client'

type LevelInfo = {
  title: string
  short: string // for the small tag on each result
  who: string // one line: is this me?
  what: string // what the issues in this level are like, and how they got here
}

/** One description per level, shared by every page so they never disagree. */
export const LEVEL_INFO: Record<Level, LevelInfo> = {
  new: {
    title: 'New to open source',
    short: 'For newcomers',
    who: "You've never opened a pull request, or only one or two.",
    what: 'Maintainers labelled these "good first issue", and our size estimate doesn\'t flag them as large.',
  },
  some: {
    title: 'Some experience',
    short: 'Some experience',
    who: "You've had a few PRs merged and can find your way around an unfamiliar codebase.",
    what: 'Beginner-labelled issues that look bigger, plus "help wanted" issues that look small.',
  },
  experienced: {
    title: 'Experienced',
    short: 'Experienced',
    who: "You're comfortable with large codebases, reviews and a maintainer's standards.",
    what: '"Help wanted" issues that look substantial, and open bugs in projects with 1,000+ stars.',
  },
}

export const LEVELS: Level[] = ['new', 'some', 'experienced']

export const KIND_LABELS: Record<Kind, string> = {
  docs: 'Documentation',
  tests: 'Tests',
  translation: 'Translation',
  performance: 'Performance',
  bug: 'Bug fixes',
  feature: 'Features',
  other: 'Other',
}

export const isLevel = (value: string | undefined): value is Level =>
  LEVELS.includes(value as Level)

/** Display name for a kind coming from the API (falls back to the raw value). */
export const kindLabel = (value: string): string => KIND_LABELS[value as Kind] ?? value

/** Each level's colour: top rule, badge, bar and button. */
export const LEVEL_LOOK: Record<Level, { rule: string; badge: string; bar: string; button: string }> = {
  new: {
    rule: 'border-t-easy-dot',
    badge: 'bg-easy-soft text-easy',
    bar: 'bg-easy-fill',
    button: 'bg-easy-fill hover:opacity-90',
  },
  some: {
    rule: 'border-t-medium-dot',
    badge: 'bg-medium-soft text-medium',
    bar: 'bg-medium-fill',
    button: 'bg-medium-fill hover:opacity-90',
  },
  experienced: {
    rule: 'border-t-link',
    badge: 'bg-link-soft text-link',
    bar: 'bg-accent',
    button: 'bg-accent hover:bg-accent-hover',
  },
}
