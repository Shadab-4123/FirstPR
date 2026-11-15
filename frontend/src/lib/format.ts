const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

export const timeAgo = (iso: string, now = Date.now()): string => {
  const seconds = (new Date(iso).getTime() - now) / 1000
  for (const [unit, size] of STEPS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}

export const pluralComments = (n: number): string =>
  n === 0 ? 'No comments yet' : n === 1 ? '1 comment' : `${n} comments`

/** Issue excerpts are raw markdown; strip the syntax so a preview reads as prose. */
export const plainText = (markdown: string): string =>
  markdown
    .replace(/```[\s\S]*?(```|$)/g, ' ') // fenced code blocks (possibly cut off by the excerpt)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links and images → their text
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '') // headings, quotes, list markers
    .replace(/(^|\s)#{1,6}\s/g, '$1') // headings inside excerpts whose newlines were collapsed
    .replace(/<!--[\s\S]*?(-->|$)/g, ' ') // HTML comments from issue templates
    .replace(/[`*~]+/g, '') // inline code, emphasis (keep _: it's part of snake_case names)
    .replace(/\s+/g, ' ')
    .trim()

export const compactNumber = (n: number): string =>
  new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
