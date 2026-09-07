import { performance } from 'node:perf_hooks'
import { expect, test } from '@playwright/test'

test('source mode preserves CRLF and reload does not become an editable undo step', async ({ page }) => {
  await page.goto('/e2e/fixtures/editor.html?huge&crlf')
  await expect(page.locator('[data-editor-ready="true"]')).toBeVisible()
  expect(await page.evaluate(() => window.markdocFixture!.getMarkdown() === window.markdocFixture!.originalMarkdown)).toBe(true)
  expect(await page.evaluate(() => window.markdocFixture!.changes())).toBe(0)
  const editor = page.getByTestId('markdoc-source-content')
  await editor.click()
  await page.keyboard.type('LOCAL EDIT')
  const changes = await page.evaluate(() => window.markdocFixture!.changes())
  await page.evaluate(() => window.markdocFixture!.loadExternal('External replacement\r\nSecond line\r\n'))
  await expect.poll(() => page.evaluate(() => window.markdocFixture!.getMarkdown())).toBe('External replacement\r\nSecond line\r\n')
  expect(await page.evaluate(() => window.markdocFixture!.changes())).toBe(changes)
  await editor.click()
  await page.keyboard.press('ControlOrMeta+z')
  expect(await page.evaluate(() => window.markdocFixture!.getMarkdown())).toBe('External replacement\r\nSecond line\r\n')
})

test('a 2 MB document stays virtualized, editable and navigable in source mode', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  page.on('pageerror', error => { throw error })
  const startedAt = performance.now()
  await page.goto('/e2e/fixtures/editor.html?huge', { timeout: 30_000 })
  const source = page.getByTestId('markdoc-source-editor')
  await expect(source).toBeVisible({ timeout: 30_000 })
  await expect.poll(() => page.evaluate(() => Boolean(window.markdocFixture)), { timeout: 30_000 }).toBe(true)
  await expect(source.locator('.cm-line').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.ProseMirror')).toHaveCount(0)
  const readyMs = Math.round(performance.now() - startedAt)
  const documentSize = await page.evaluate(() => {
    const text = window.markdocFixture!.getMarkdown()
    return { bytes: new TextEncoder().encode(text).length, lines: text.split('\n').length }
  })
  expect(documentSize.bytes).toBeGreaterThan(2_000_000)
  expect(documentSize.bytes).toBeLessThan(2_200_000)
  expect(documentSize.lines).toBe(20_000)
  const renderedLines = await source.locator('.cm-line').count()
  expect(renderedLines).toBeGreaterThan(0)
  expect(renderedLines).toBeLessThan(500)

  const content = page.getByTestId('markdoc-source-content')
  await content.focus()
  const isMac = await page.evaluate(() => navigator.platform.includes('Mac'))
  await page.keyboard.press(isMac ? 'Meta+Home' : 'Control+Home')
  const prefix = 'Edited at the beginning. '
  await page.keyboard.insertText(prefix)
  await expect.poll(() => page.evaluate(expectedPrefix => {
    const fixture = window.markdocFixture!
    const text = fixture.getMarkdown()
    return text === expectedPrefix + fixture.originalMarkdown && text.endsWith('HUGE_DOCUMENT_END_SENTINEL')
  }, prefix), { timeout: 30_000 }).toBe(true)

  await page.keyboard.press(isMac ? 'Meta+z' : 'Control+z')
  await expect.poll(() => page.evaluate(() => {
    const fixture = window.markdocFixture!
    return fixture.getMarkdown() === fixture.originalMarkdown
  }), { timeout: 30_000 }).toBe(true)

  const lastHeading = page.getByRole('button', { name: 'Final huge heading', exact: true })
  await lastHeading.click()
  await expect(lastHeading).toHaveAttribute('data-located', 'true')
  const headingLine = source.locator('.cm-line').filter({ hasText: /^## Final huge heading$/ })
  await expect(headingLine).toBeInViewport({ timeout: 30_000 })
  await expect.poll(() => source.locator('.cm-line').count()).toBeLessThan(500)

  let dismissedConfirm = false
  page.once('dialog', async dialog => {
    const type = dialog.type()
    await dialog.dismiss()
    dismissedConfirm = type === 'confirm'
  })
  await page.getByRole('button', { name: 'editor.formattedMode', exact: true }).click()
  await expect.poll(() => dismissedConfirm).toBe(true)
  await expect(page.getByRole('button', { name: 'editor.sourceMode', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(source).toBeVisible()
  await expect(page.locator('.ProseMirror')).toHaveCount(0)
  expect(await page.evaluate(() => {
    const fixture = window.markdocFixture!
    return fixture.getMarkdown() === fixture.originalMarkdown
  })).toBe(true)

  await expect(source.locator('.markdoc-source-print')).toHaveCount(0)
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')))
  const printContent = source.locator('pre.markdoc-source-print')
  await expect(printContent).toHaveCount(1)
  expect(await printContent.evaluate(element => {
    const text = element.textContent ?? ''
    return text === window.markdocFixture!.getMarkdown() && text.endsWith('HUGE_DOCUMENT_END_SENTINEL')
  })).toBe(true)
  try {
    await page.emulateMedia({ media: 'print' })
    await expect(printContent).toBeVisible()
    await expect.soft(source.locator('.cm-editor')).toBeHidden()
  } finally {
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
    await page.emulateMedia({ media: 'screen' })
  }
  await expect(source.locator('.markdoc-source-print')).toHaveCount(0)
  await expect(source.locator('.cm-editor')).toBeVisible()
  await expect.poll(() => source.locator('.cm-line').count()).toBeLessThan(500)

  const measurements = { ...documentSize, readyMs, renderedLines }
  console.log('Huge document measurements:', JSON.stringify(measurements))
  await testInfo.attach('huge-document-measurements', {
    body: JSON.stringify(measurements, null, 2),
    contentType: 'application/json',
  })
})
