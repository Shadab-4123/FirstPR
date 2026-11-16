import type { SavedStatus } from '../api/client'
import { STATUSES } from '../lib/saved'
import { CheckIcon } from './icons'

/** The four steps as a numbered radio group: one click moves an issue along. */
export const StatusPicker = ({
  value,
  onChange,
  disabled,
  name,
}: {
  value: SavedStatus
  onChange: (status: SavedStatus) => void
  disabled?: boolean
  name: string
}) => (
  <fieldset disabled={disabled} className="disabled:opacity-60">
    <legend className="sr-only">Your progress</legend>
    <ol className="space-y-2">
      {STATUSES.map((status, i) => {
        const checked = value === status.value
        const hintId = `${name}-${status.value}-hint`
        return (
          <li
            key={status.value}
            className={`relative flex items-center gap-3 rounded-xl border px-3 py-2.5 transition
              has-focus-visible:outline-2 has-focus-visible:outline-link ${
                checked ? 'border-link-line bg-link-soft' : 'border-transparent bg-well/70 hover:border-rule-strong'
              }`}
          >
            <span
              aria-hidden="true"
              className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
                checked ? 'bg-link text-white' : 'bg-white text-muted'
              }`}
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <label className={`block cursor-pointer text-sm font-semibold after:absolute after:inset-0 ${checked ? 'text-link' : 'text-ink'}`}>
                <input
                  type="radio"
                  name={name}
                  value={status.value}
                  checked={checked}
                  onChange={() => onChange(status.value)}
                  aria-describedby={hintId}
                  className="sr-only"
                />
                {status.label}
              </label>
              <span id={hintId} className="block text-xs text-muted">
                {status.hint}
              </span>
            </span>
            {checked && <CheckIcon className="size-4 text-link" />}
          </li>
        )
      })}
    </ol>
  </fieldset>
)
