import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it } from 'vitest'

import { ThemeToggle } from './ThemeToggle'

afterEach(() => {
  delete document.documentElement.dataset.theme
  localStorage.clear()
})

it('switches between light and dark, and remembers the choice', async () => {
  document.documentElement.dataset.theme = 'light'
  render(<ThemeToggle />)

  await userEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }))
  expect(document.documentElement.dataset.theme).toBe('dark')
  expect(localStorage.getItem('firstpr-theme')).toBe('dark')

  await userEvent.click(await screen.findByRole('button', { name: 'Switch to light theme' }))
  expect(document.documentElement.dataset.theme).toBe('light')
  expect(localStorage.getItem('firstpr-theme')).toBe('light')
})
