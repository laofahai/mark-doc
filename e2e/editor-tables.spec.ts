import { test, expect } from '@playwright/test'

test('table cells stay compact and grow with multiline content', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('/e2e/fixtures/editor.html?table')
  await expect(page.locator('[data-editor-ready="true"]')).toBeVisible()
  await page.evaluate(() => window.markdocFixture!.loadExternal(
    '# Compact table\n\n<table><tbody><tr><th><p>Heading</p></th></tr><tr><td><p></p></td></tr><tr><td><p>One line</p></td></tr><tr><td><p>First</p><p>Second</p><p>Third</p></td></tr></tbody></table>',
  ))
  await expect(page.locator('.ProseMirror td')).toHaveCount(3)
  const cells = await page.locator('.ProseMirror th, .ProseMirror td').evaluateAll(elements => elements.map(cell => {
    const first = cell.firstElementChild!
    return {
      height: (cell as HTMLElement).offsetHeight,
      contentHeight: (first as HTMLElement).offsetHeight,
      paddingTop: getComputedStyle(cell).paddingTop,
      paddingBottom: getComputedStyle(cell).paddingBottom,
      marginTop: getComputedStyle(first).marginTop,
      marginBottom: getComputedStyle(cell.lastElementChild!).marginBottom,
    }
  }))
  for (const cell of cells) {
    expect(cell.paddingTop).toBe('6px')
    expect(cell.paddingBottom).toBe('6px')
    expect(cell.marginTop).toBe('0px')
    expect(cell.marginBottom).toBe('0px')
  }
  for (const cell of cells.slice(0, 3)) expect(cell.height - cell.contentHeight).toBeLessThanOrEqual(14)
  expect(cells[3].height).toBeGreaterThan(cells[2].height)
  const headingMargin = await page.locator('.ProseMirror h1').evaluate(el => getComputedStyle(el).marginTop)
  expect(parseFloat(headingMargin)).toBeGreaterThan(0)
})

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
