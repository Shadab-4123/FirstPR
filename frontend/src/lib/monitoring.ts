// Error reports to Sentry, only in builds made with VITE_SENTRY_DSN set.
// The SDK is loaded on demand, so without a DSN visitors download none of it.
// Errors that happen before it has loaded are queued, then sent.

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined

type Sentry = typeof import('./sentry')

let sentry: Sentry | null = null
let starting = false
const queued: unknown[] = []

export const startMonitoring = async (dsn = DSN): Promise<boolean> => {
  if (!dsn) return false
  starting = true
  const sdk = await import('./sentry')
  sdk.init({
    dsn,
    environment: import.meta.env.MODE,
    // No user details or cookies. Cookies are HttpOnly anyway, but say so explicitly.
    dataCollection: { userInfo: false, cookies: false, httpBodies: [] },
    tracesSampleRate: 0, // errors only: keeps the free plan's quota
  })
  sentry = sdk
  queued.splice(0).forEach((error) => sdk.captureException(error))
  return true
}

/** For React's root error hooks: errors no component caught. */
export const reportError = (error: unknown) => {
  if (sentry) sentry.captureException(error)
  else if (starting) queued.push(error)
}
