import { expect, test } from '@playwright/test'

test('app loads to a blank document with no external requests', async ({ page, baseURL }) => {
  const external: string[] = []
  page.on('request', (req) => {
    if (!req.url().startsWith(baseURL!)) external.push(req.url())
  })
  await page.goto('/')
  await expect(page).toHaveTitle('Untitled document - Open Writer')
  await expect(page.getByRole('textbox', { name: 'Document' })).toBeVisible()
  expect(external).toEqual([])
})
