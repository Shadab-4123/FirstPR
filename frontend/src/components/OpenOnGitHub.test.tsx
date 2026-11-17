import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'

import { SIGNED_IN, SIGNED_OUT, mockApi, renderPage } from '../test/utils'
import { OpenOnGitHub } from './OpenOnGitHub'

const URL = 'https://github.com/octo/repo/issues/7'

it('asks signed-out visitors to sign in first, and lets them go on to GitHub later', async () => {
  mockApi({ 'GET /api/v1/auth/me': SIGNED_OUT })
  renderPage(<OpenOnGitHub url={URL} />, { route: '/issues/7' })

  await userEvent.click(await screen.findByRole('button', { name: 'Open on GitHub' }))
  const dialog = screen.getByRole('dialog', { name: 'Track your open source journey' })
  expect(dialog).toBeVisible()
  expect(screen.getByRole('link', { name: 'Sign in with GitHub' })).toHaveAttribute(
    'href',
    expect.stringContaining('next=%2Fissues%2F7'),
  )

  const later = screen.getByRole('link', { name: 'Later, just open on GitHub' })
  expect(later).toHaveAttribute('href', URL)
  expect(later).toHaveAttribute('target', '_blank')
  await userEvent.click(later)
  expect(dialog).not.toHaveAttribute('open')
})

it('goes straight to GitHub when signed in', async () => {
  mockApi({ 'GET /api/v1/auth/me': SIGNED_IN })
  renderPage(<OpenOnGitHub url={URL} />)
  expect(await screen.findByRole('link', { name: 'Open on GitHub' })).toHaveAttribute('href', URL)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
