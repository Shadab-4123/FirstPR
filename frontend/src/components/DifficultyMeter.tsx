import type { Difficulty } from '../api/client'

const LEVEL: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 }
const COLOR: Record<Difficulty, string> = { easy: 'bg-easy', medium: 'bg-medium', hard: 'bg-hard' }
const TEXT: Record<Difficulty, string> = { easy: 'text-easy', medium: 'text-medium', hard: 'text-hard' }

/** Three squares, like a slice of GitHub's contribution graph. */
export const DifficultyMeter = ({ label, reasons }: { label: Difficulty | null; reasons: string[] }) => {
  if (!label) return <span className="text-sm text-muted">Not estimated</span>

  const filled = LEVEL[label]
  return (
    <span
      className={`inline-flex items-center gap-2 text-sm font-semibold ${TEXT[label]}`}
      title={reasons.length ? `Estimated from: ${reasons.join('; ')}` : undefined}
    >
      <span aria-hidden="true" className="flex gap-[3px]">
        {[1, 2, 3].map((i) => (
          <span key={i} className={`size-2.5 rounded-[2px] ${i <= filled ? COLOR[label] : 'bg-rule'}`} />
        ))}
      </span>
      {label[0].toUpperCase() + label.slice(1)}
    </span>
  )
}
