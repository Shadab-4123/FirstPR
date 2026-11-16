import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { makeSaved } from '../test/fixtures'
import { SIGNED_IN, SIGNED_OUT, mockApi, renderPage } from '../test/utils'
import { TrackIssue } from './TrackIssue'

describe('TrackIssue', () => {
  it('asks signed-out visitors to sign in, returning to this issue', async () => {
    mockApi({ 'GET /api/v1/auth/me': SIGNED_OUT })
    renderPage(<TrackIssue issueId={1} />, { route: '/issues/1' })
    const link = await screen.findByRole('link', { name: 'Sign in' })
    expect(link.getAttribute('href')).toContain('next=%2Fissues%2F1')
  })

  it('saves, then moves the issue along the steps', async () => {
    const puts: string[] = []
    mockApi({
      'GET /api/v1/auth/me': SIGNED_IN,
      'GET /api/v1/me/saved': { body: [] },
      'PUT /api/v1/me/saved/1': (_, init) => {
        const { status } = JSON.parse(String(init?.body))
        puts.push(status)
        return { body: makeSaved({ status }) }
      },
    })
    const user = userEvent.setup()
    renderPage(<TrackIssue issueId={1} />)

    await user.click(await screen.findByRole('button', { name: 'Save to My issues' }))
    expect(await screen.findByRole('radio', { name: 'Saved' })).toBeChecked()

    await user.click(screen.getByRole('radio', { name: 'PR opened' }))
    await waitFor(() => expect(screen.getByRole('radio', { name: 'PR opened' })).toBeChecked())
    expect(puts).toEqual(['saved', 'pr_opened'])
  })

  it('shows the error when saving fails, and stays unsaved', async () => {
    mockApi({
      'GET /api/v1/auth/me': SIGNED_IN,
      'GET /api/v1/me/saved': { body: [] },
      'PUT /api/v1/me/saved/1': { status: 502, body: { error: { code: 'upstream_error', message: 'Database is busy.' } } },
    })
    const user = userEvent.setup()
    renderPage(<TrackIssue issueId={1} />)
    await user.click(await screen.findByRole('button', { name: 'Save to My issues' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Database is busy.')
    expect(screen.getByRole('button', { name: 'Save to My issues' })).toBeEnabled()
  })
})
