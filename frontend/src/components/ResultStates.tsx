export const ResultsSkeleton = () => (
  <ul aria-hidden="true" className="animate-pulse">
    {Array.from({ length: 5 }, (_, i) => (
      <li key={i} className="space-y-3 border-b border-rule py-6">
        <div className="h-3.5 w-48 rounded bg-rule" />
        <div className="h-5 w-3/4 rounded bg-rule" />
        <div className="h-3.5 w-2/3 rounded bg-rule/70" />
      </li>
    ))}
  </ul>
)

export const EmptyState = ({ onReset }: { onReset: () => void }) => (
  <div className="py-16">
    <p className="font-display text-2xl font-medium">No open issues match all of that.</p>
    <p className="mt-2 max-w-prose text-muted">
      Try a different language, any size, or fewer stars. Each one widens the search.
    </p>
    <button
      type="button"
      onClick={onReset}
      className="mt-5 rounded-md bg-ink px-4 py-2 font-semibold text-white hover:bg-link"
    >
      Clear filters
    </button>
  </div>
)

export const ErrorState = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div role="alert" className="py-16">
    <p className="font-display text-2xl font-medium">Issues couldn't be loaded.</p>
    <p className="mt-2 max-w-prose text-muted">{message} Check that the API is running, then try again.</p>
    <button
      type="button"
      onClick={onRetry}
      className="mt-5 rounded-md bg-ink px-4 py-2 font-semibold text-white hover:bg-link"
    >
      Try again
    </button>
  </div>
)
