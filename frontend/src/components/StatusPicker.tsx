import type { SavedStatus } from '../api/client'
import { STATUSES } from '../lib/saved'

/** The four steps as a radio group: one click moves an issue along. */
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
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-2">
      {STATUSES.map((status) => (
        <label
          key={status.value}
          title={status.hint}
          className="cursor-pointer rounded-md border border-rule bg-white px-2.5 py-1.5 text-center text-sm
            has-checked:border-ink has-checked:bg-ink has-checked:font-semibold has-checked:text-white
            has-focus-visible:outline-2 has-focus-visible:outline-link hover:border-ink"
        >
          <input
            type="radio"
            name={name}
            value={status.value}
            checked={value === status.value}
            onChange={() => onChange(status.value)}
            className="sr-only"
          />
          {status.label}
        </label>
      ))}
    </div>
  </fieldset>
)
