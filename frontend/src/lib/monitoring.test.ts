import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ init: vi.fn(), captureException: vi.fn() }))
vi.mock('./sentry', () => sdk)

describe('monitoring', () => {
  beforeEach(() => {
    vi.resetModules() // fresh module state per test
    sdk.init.mockClear()
    sdk.captureException.mockClear()
  })

  it('does nothing without a DSN', async () => {
    const { startMonitoring, reportError } = await import('./monitoring')
    expect(await startMonitoring('')).toBe(false)
    reportError(new Error('x'))
    expect(sdk.init).not.toHaveBeenCalled()
    expect(sdk.captureException).not.toHaveBeenCalled()
  })

  it('sends errors that happened while the SDK was loading, then reports directly', async () => {
    const { startMonitoring, reportError } = await import('./monitoring')
    const starting = startMonitoring('https://key@sentry.invalid/1')
    const early = new Error('early')
    reportError(early)
    expect(sdk.captureException).not.toHaveBeenCalled()

    await starting
    expect(sdk.init).toHaveBeenCalledWith(expect.objectContaining({ dataCollection: expect.objectContaining({ userInfo: false }) }))
    expect(sdk.captureException).toHaveBeenCalledWith(early)

    const late = new Error('late')
    reportError(late)
    expect(sdk.captureException).toHaveBeenLastCalledWith(late)
  })
})
