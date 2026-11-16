import { expect, test } from '@playwright/test'

/**
 * The core promise, as a newcomer would use it: search, open an issue's brief,
 * judge it, and get back to the same results.
 */
test('search, read an issue brief, and come back to the same results', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(5) // every seeded issue

  await page.getByRole('searchbox', { name: 'Search titles and descriptions' }).fill('threads')
  await expect(page).toHaveURL(/q=threads/) // the filter lives in the URL, so it can be shared
  const results = page.getByRole('heading', { level: 2 })
  await expect(results).toHaveCount(1)
  await expect(results).toHaveText('Add site: Threads')

  await results.getByRole('link').click()
  await expect(page).toHaveURL(/\/issues\/\d+$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Add site: Threads')
  await expect(page.getByText('Still open and unclaimed.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'What this issue is about' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open on GitHub' })).toHaveAttribute(
    'href',
    /^https:\/\/github\.com\/.+\/issues\/10$/,
  )
  await expect(page.getByText('to save this issue and track your progress.')).toBeVisible()

  await page.getByRole('button', { name: '← Back to results' }).click()
  await expect(page).toHaveURL(/q=threads/)
  await expect(page.getByRole('searchbox', { name: 'Search titles and descriptions' })).toHaveValue('threads')
  await expect(results).toHaveText('Add site: Threads')
})

test('an issue that no longer exists explains itself', async ({ page }) => {
  await page.goto('/issues/999999')
  await expect(page.getByText("This issue isn't in FirstPR any more.")).toBeVisible()
  await page.getByRole('link', { name: 'Find another issue' }).click()
  await expect(page).toHaveURL('/')
})
