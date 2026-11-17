import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'

import { makeIssue } from '../test/fixtures'
import { SIGNED_OUT, mockApi, renderPage } from '../test/utils'
import { LevelPage } from './LevelPage'

const issuesPage = { items: [makeIssue()], page: 1, page_size: 20, total: 1 }

it('narrows a level by language and size, keeping both in the URL and the request', async () => {
  const searches: URLSearchParams[] = []
  mockApi({
    'GET /api/v1/auth/me': SIGNED_OUT,
    'GET /api/v1/stats': { status: 503 },
    'GET /api/v1/me/saved': { body: [] },
    'GET /api/v1/meta/filters': { body: { languages: [{ value: 'Python', count: 5 }], labels: [], difficulties: [] } },
    'GET /api/v1/meta/levels': { body: [{ level: 'new', total: 9, kinds: [{ value: 'docs', count: 4 }] }] },
    'GET /api/v1/issues': (url) => {
      searches.push(url.searchParams)
      return { body: issuesPage }
    },
  })
  const { location } = renderPage(<LevelPage />, { route: '/explore/new', path: '/explore/:level' })
  const user = userEvent.setup()

  // Kind-of-work counts are for the whole level, so they show only while nothing narrows it.
  expect(await screen.findByRole('button', { name: /Documentation\s*4/ })).toBeInTheDocument()

  await screen.findByRole('option', { name: 'Python' })
  await user.selectOptions(screen.getByLabelText('Language (short form)'), 'Python')
  await user.selectOptions(screen.getByLabelText('Size (short form)'), 'easy')

  await waitFor(() => expect(location()).toBe('/explore/new?language=Python&difficulty=easy'))
  const last = searches.at(-1)!
  expect([last.get('level'), last.get('language'), last.get('difficulty')]).toEqual(['new', 'Python', 'easy'])
  expect(screen.getByRole('button', { name: 'Documentation' })).toBeInTheDocument() // count hidden

  await user.click(screen.getByRole('button', { name: 'Clear filters' }))
  await waitFor(() => expect(location()).toBe('/explore/new'))
})
