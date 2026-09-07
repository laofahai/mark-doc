import { test, expect } from '@playwright/test'

for (const zoom of [75, 100, 150]) {
  test(`table resize persists through Markdown reload at ${zoom}% zoom`, async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 })
    await page.goto(`/e2e/fixtures/editor.html?table&zoom=${zoom}`)
    await expect(page.locator('[data-editor-ready="true"]')).toBeVisible()
    const cell = page.locator('.ProseMirror th').first()
    await expect(cell).toBeVisible()
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const before = (await cell.boundingBox())!
    await page.mouse.move(before.x + before.width - 2, before.y + before.height / 2)
    await expect(page.locator('.column-resize-handle')).toHaveCount(3)
    await page.mouse.down()
    if (zoom === 150) {
      await page.mouse.move(before.x + before.width + 38, before.y + before.height / 2, { steps: 6 })
      await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    }
    await page.mouse.move(before.x + before.width + 78, before.y + before.height / 2, { steps: 12 })
    await page.mouse.up()
    await expect.poll(async () => (await cell.boundingBox())!.width).toBeGreaterThan(before.width + 40)
    const saved = await page.evaluate(() => window.markdocFixture!.getMarkdown())
    expect(saved).toContain('colwidth=')
    const after = (await cell.boundingBox())!.width
    expect(Math.abs(after - before.width - 80)).toBeLessThan(6)
    await page.evaluate(() => window.markdocFixture!.reload())
    await expect.poll(async () => (await cell.boundingBox())!.width).toBeCloseTo(after, 0)
    expect(await page.evaluate(() => window.markdocFixture!.getMarkdown())).toBe(saved)
  })
}
