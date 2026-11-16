import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'

import { makeIssue, makeSaved } from '../test/fixtures'
import { SIGNED_IN, SIGNED_OUT, mockApi, renderPage } from '../test/utils'
import { MyIssuesPage } from './MyIssuesPage'

const saved = [
  makeSaved({ status: 'merged', issue: makeIssue({ id: 3, title: 'Typo in README' }) }),
  makeSaved({ status: 'pr_opened', issue_state: 'closed', issue: makeIssue({ id: 2, title: 'Add tests' }) }),
  makeSaved({ status: 'saved', issue: makeIssue({ id: 1, title: 'Fix the parser', is_available: false }) }),
]

it('groups saved issues in journey order and flags what changed on GitHub', async () => {
  mockApi({ 'GET /api/v1/auth/me': SIGNED_IN, 'GET /api/v1/me/saved': { body: saved } })
  renderPage(<MyIssuesPage />)

  const headings = await screen.findAllByRole('heading', { level: 2 })
  expect(headings.map((h) => h.firstChild?.textContent)).toEqual(['Saved', 'PR opened', 'Merged'])
  expect(screen.getByText('1 saved · 1 PR opened · 1 merged')).toBeInTheDocument()
  expect(screen.getByText('Closed on GitHub. If your PR was merged, mark it Merged.')).toBeInTheDocument()
  expect(screen.getByText('Someone else may have picked this up.')).toBeInTheDocument()
})

it('removes an issue from the list', async () => {
  mockApi({
    'GET /api/v1/auth/me': SIGNED_IN,
    'GET /api/v1/me/saved': { body: saved.slice(0, 1) },
    'DELETE /api/v1/me/saved/3': { status: 204 },
  })
  const user = userEvent.setup()
  renderPage(<MyIssuesPage />)
  const row = (await screen.findByText('Typo in README')).closest('li')!
  await user.click(within(row).getByRole('button', { name: 'Remove' }))
  expect(await screen.findByText('Nothing saved yet.')).toBeInTheDocument()
})

it('invites signed-out visitors to sign in', async () => {
  mockApi({ 'GET /api/v1/auth/me': SIGNED_OUT })
  renderPage(<MyIssuesPage />)
  const main = await screen.findByRole('main')
  const link = await within(main).findByRole('link', { name: 'Sign in with GitHub' })
  expect(link.getAttribute('href')).toContain('next=%2Fmy-issues') // comes back here after GitHub
})
