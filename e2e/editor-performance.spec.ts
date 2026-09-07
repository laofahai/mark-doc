import { performance } from 'node:perf_hooks'
import { expect, test } from '@playwright/test'

test('a 2000-paragraph document opens with an interactive toolbar', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  page.on('pageerror', error => { throw error })
  const startedAt = performance.now()
  await page.goto('/e2e/fixtures/editor.html?large', { timeout: 30_000 })
  await expect(page.locator('[data-editor-ready="true"]')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.ProseMirror p')).toHaveCount(2000, { timeout: 30_000 })
  const toolbarButton = page.getByLabel('editor.textColor', { exact: true })
  await expect(toolbarButton).toBeEnabled({ timeout: 30_000 })
  const readyMs = Math.round(performance.now() - startedAt)

  const clickedAt = performance.now()
  await toolbarButton.click({ timeout: 30_000 })
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 })
  const toolbarResponseMs = Math.round(performance.now() - clickedAt)

  // Include navigation and rendering in readiness; record timings without a hardware-specific threshold.
  const timings = { paragraphs: 2000, readyMs, toolbarResponseMs }
  console.log('Large document timings:', JSON.stringify(timings))
  await testInfo.attach('large-document-timings', {
    body: JSON.stringify(timings, null, 2),
    contentType: 'application/json',
  })
})
