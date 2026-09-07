import { test, expect } from '@playwright/test'

test('twenty thousand headings use a virtual outline and navigate to the last heading', async ({ page }) => {
  await page.goto('/e2e/fixtures/editor.html?manyheadings')
  const outline = page.getByTestId('virtual-outline')
  await expect(outline).toBeVisible()
  await expect(page.getByTestId('markdoc-source-editor')).toBeVisible()
  expect(await outline.getByRole('button').count()).toBeLessThan(100)
  await outline.evaluate(element => { element.scrollTop = element.scrollHeight })
  const last = outline.getByRole('button', { name: 'Heading 20000', exact: true })
  await expect(last).toBeVisible()
  await last.click()
  await expect(last).toHaveAttribute('data-located', 'true')
  await expect(page.locator('.cm-line').filter({ hasText: '## Heading 20000' })).toBeVisible()
})
