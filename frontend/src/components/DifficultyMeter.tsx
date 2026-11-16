import type { Difficulty } from '../api/client'

const FILLED: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 }
const LOOK: Record<Difficulty, { pill: string; dot: string }> = {
  easy: { pill: 'border-easy-line bg-easy-soft text-easy', dot: 'bg-easy' },
  medium: { pill: 'border-medium-line bg-medium-soft text-medium', dot: 'bg-medium' },
  hard: { pill: 'border-hard-line bg-hard-soft text-hard', dot: 'bg-hard' },
}

/** Pill with 1–3 filled dots and the word, so the size never depends on colour alone. */
export const DifficultyMeter = ({ label, reasons }: { label: Difficulty | null; reasons: string[] }) => {
  if (!label) return <span className="text-xs text-muted">Size not estimated</span>

  const look = LOOK[label]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${look.pill}`}
      title={reasons.length ? `Estimated from: ${reasons.join('; ')}` : undefined}
    >
      <span aria-hidden="true" className="flex gap-0.5">
        {[1, 2, 3].map((i) => (
          <span key={i} className={`size-1.5 rounded-full ${i <= FILLED[label] ? look.dot : 'bg-current opacity-20'}`} />
        ))}
      </span>
      {label[0].toUpperCase() + label.slice(1)}
    </span>
  )
}
