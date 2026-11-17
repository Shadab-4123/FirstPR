import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'

import { SIGNED_IN, SIGNED_OUT, mockApi, renderPage } from '../test/utils'
import { ActivityPage } from './ActivityPage'

const ROUTES = { 'GET /api/v1/stats': { status: 503 }, 'GET /api/v1/me/saved': { body: [] } }

const calendar = {
  total: 6,
  weeks: [
    [
      { date: '2026-11-08', count: 0, level: 0 },
      { date: '2026-11-09', count: 4, level: 3 },
      { date: '2026-11-10', count: 2, level: 1 },
    ],
  ],
}

it('shows the year, the numbers from it, and a table of the same data', async () => {
  mockApi({ ...ROUTES, 'GET /api/v1/auth/me': SIGNED_IN, 'GET /api/v1/me/contributions': { body: calendar } })
  renderPage(<ActivityPage />)

  expect(await screen.findByRole('heading', { name: '6 contributions in the last year' })).toBeInTheDocument()
  expect(screen.getByText('Longest streak').closest('div')).toHaveTextContent('2days in a row')
  expect(screen.getByText('Busiest day').closest('div')).toHaveTextContent('Mon, Nov 9, 2026')

  await userEvent.click(screen.getByRole('button', { name: 'Show as table' }))
  const row = within(screen.getByRole('table')).getByRole('row', { name: /November 2026/ })
  expect(row).toHaveTextContent('November 202662')
})

it('asks signed-out visitors to sign in', async () => {
  mockApi({ ...ROUTES, 'GET /api/v1/auth/me': SIGNED_OUT })
  renderPage(<ActivityPage />)
  expect(await screen.findByText('Sign in to see your contribution graph')).toBeInTheDocument()
})

it('offers a fresh sign-in when GitHub no longer accepts the token', async () => {
  mockApi({
    ...ROUTES,
    'GET /api/v1/auth/me': SIGNED_IN,
    'GET /api/v1/me/contributions': {
      status: 409,
      body: { error: { code: 'conflict', message: "GitHub no longer accepts FirstPR's access." } },
    },
  })
  renderPage(<ActivityPage />)
  expect(await screen.findByRole('alert')).toHaveTextContent("GitHub no longer accepts FirstPR's access.")
  expect(screen.getByRole('link', { name: 'Sign in again' })).toBeInTheDocument()
})
