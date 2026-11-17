// Shared class strings for the design system's buttons, cards and chips,
// so every page draws them the same way.

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white ' +
  'transition hover:bg-accent-hover active:scale-[0.98] disabled:opacity-50'

export const btnSecondary =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-rule bg-surface px-4 py-2 text-sm font-semibold ' +
  'text-body transition hover:bg-well disabled:opacity-50'

export const btnGhost =
  'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted transition hover:bg-well hover:text-body disabled:opacity-50'

export const card = 'rounded-2xl border border-rule bg-surface shadow-card'

export const cardHover = 'transition hover:-translate-y-0.5 hover:border-rule-strong hover:shadow-lift'

export const chip = 'rounded-full bg-well px-2.5 py-0.5 text-xs font-medium text-body'

/** Small uppercase label above a section, in the mono face, e.g. "LEVEL 01". */
export const eyebrow = 'flex items-center gap-1.5 font-mono text-xs tracking-wide text-link uppercase'

export const pageWidth = 'mx-auto w-full max-w-6xl px-4 sm:px-8'
