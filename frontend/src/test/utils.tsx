import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { vi } from 'vitest'

/** Renders at `route` with a fresh query cache (no retries, so errors show at once). */
export const renderPage = (ui: ReactElement, { route = '/', path = '*' }: { route?: string; path?: string } = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  let location = ''
  const LocationSpy = () => {
    const loc = useLocation()
    location = loc.pathname + loc.search
    return null
  }
  const utils = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path} element={ui} />
        </Routes>
        <LocationSpy />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { ...utils, location: () => location }
}

type Handler = (url: URL, init?: RequestInit) => { status?: number; body?: unknown }

/**
 * Replaces fetch. Keys are "METHOD /path" (no query string); a missing key is a
 * test bug, so it throws instead of silently returning nothing.
 */
export const mockApi = (routes: Record<string, Handler | { status?: number; body?: unknown }>) => {
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const key = `${init?.method ?? 'GET'} ${url.pathname}`
    const route = routes[key]
    if (!route) throw new Error(`Unmocked request: ${key}`)
    const { status = 200, body } = typeof route === 'function' ? route(url, init) : route
    return new Response(status === 204 ? null : JSON.stringify(body ?? null), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

export const SIGNED_OUT = { status: 401, body: { error: { code: 'unauthorized', message: 'Not signed in.' } } }
export const SIGNED_IN = { body: { login: 'octo', name: 'Octo', avatar_url: null } }
