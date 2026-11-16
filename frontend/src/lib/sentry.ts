// Only the two functions we use, so the build can drop the rest of the SDK.
// Loaded on demand by ./monitoring.ts.
export { captureException, init } from '@sentry/react'
