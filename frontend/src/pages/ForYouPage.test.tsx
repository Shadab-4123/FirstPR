import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'

import type { RecommendedPage } from '../api/client'
import { makeIssue } from '../test/fixtures'
import { SIGNED_IN, mockApi, renderPage } from '../test/utils'
import { ForYouPage } from './ForYouPage'

const page = (level: RecommendedPage['level']): RecommendedPage => ({
  profile: {
    languages: [
      { name: 'Python', share: 0.7 },
      { name: 'Go', share: 0.3 },
    ],
    level: 'new',
    merged_prs: 0,
    repos_counted: 14,
    updated_at: new Date().toISOString(),
  },
  level,
  items: [{ ...makeIssue(), match: 0.95, match_reasons: ['Python, your main language', 'Right for your level'] }],
  page: 1,
  page_size: 20,
  total: 1,
})

it('explains the guess and why each issue is listed', async () => {
  mockApi({ 'GET /api/v1/auth/me': SIGNED_IN, 'GET /api/v1/me/recommended': (url) => ({ body: page(url.searchParams.get('level') as never ?? 'new') }) })
  renderPage(<ForYouPage />)
  expect(await screen.findByText(/From your 14 public repos, you write/)).toHaveTextContent(
    'Python (70%) and Go (30%)',
  )
  expect(screen.getByText('Python, your main language · Right for your level')).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: /New to open source/ })).toBeChecked()
})

it('switching level re-ranks and keeps the choice in the URL', async () => {
  const fetchMock = mockApi({
    'GET /api/v1/auth/me': SIGNED_IN,
    'GET /api/v1/me/recommended': (url) => ({ body: page((url.searchParams.get('level') as never) ?? 'new') }),
  })
  const user = userEvent.setup()
  const { location } = renderPage(<ForYouPage />, { route: '/for-you' })
  await user.click(await screen.findByRole('radio', { name: 'Experienced' }))
  await waitFor(() => expect(screen.getByRole('radio', { name: 'Experienced' })).toBeChecked())
  expect(location()).toBe('/for-you?level=experienced')
  const urls = fetchMock.mock.calls.map(([u]) => String(u))
  expect(urls.some((u) => u.includes('/me/recommended?level=experienced'))).toBe(true)
})
