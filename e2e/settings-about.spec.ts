import { test, expect } from '@playwright/test'

for (const lang of ['en', 'zh']) {
  test(`about is readable in ${lang} on narrow and wide screens`, async ({ page }) => {
    for (const width of [360, 640]) {
      await page.setViewportSize({ width, height: 640 })
      await page.goto(`/e2e/fixtures/about.html?lang=${lang}${width === 360 ? '&dark' : ''}`)
      await expect(page.getByRole('heading', { name: 'MarkDoc' })).toBeVisible()
      await expect.poll(() => page.locator('img').evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true)
      for (const link of await page.getByRole('link').all()) {
        const box = (await link.boundingBox())!
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(width)
      }
      expect(await page.locator('body').evaluate(el => el.scrollWidth)).toBeLessThanOrEqual(width)
      await page.screenshot({ path: `/tmp/markdoc-about-${lang}-${width}.png` })
    }
  })
}
