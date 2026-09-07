import { readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { buildPrintPageCss } from '../src/services/document/page-layout'

const css = readFileSync(new URL('../src/styles/editor.css', import.meta.url), 'utf8')
const theme = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8').match(/:root\s*\{[^}]+\}/)![0]

test.beforeEach(({ page }) => {
  page.on('pageerror', error => { throw error })
})

test('outline navigation locates headings despite Markdown whitespace normalization', async ({ page }) => {
  await page.goto('/e2e/fixtures/editor.html?interactions')
  await expect(page.locator('.ProseMirror h2')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Target', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Target', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Target', exact: true })).toHaveAttribute('data-located', 'true')
  await expect.poll(async () => {
    const heading = (await page.locator('.ProseMirror h2').boundingBox())!
    const canvas = (await page.locator('.markdoc-document-canvas').boundingBox())!
    return Math.abs(heading.y - canvas.y)
  }).toBeLessThan(40)
})

test('pasting an image near the beginning does not move selection to the document end', async ({ page }) => {
  await page.goto('/e2e/fixtures/editor.html?interactions')
  const first = page.locator('.ProseMirror p').first()
  await first.click()
  await page.keyboard.press('Home')
  await first.evaluate(async element => {
    const canvas = document.createElement('canvas')
    canvas.width = 80; canvas.height = 40
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(value => resolve(value!)))
    const clipboard = new DataTransfer()
    clipboard.items.add(new File([blob], 'screenshot.png', { type: 'image/png' }))
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }))
  })
  await expect(page.locator('.ProseMirror img')).toHaveCount(1)
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const scroll = await page.locator('.markdoc-document-canvas').evaluate(element => element.scrollTop)
  expect(scroll).toBeLessThan(500)
})

for (const landscape of [false, true]) {
  test(`live editor preserves paper layout while fitting a narrow canvas (${landscape ? 'landscape' : 'portrait'})`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(`/e2e/fixtures/editor.html${landscape ? '?landscape' : ''}`)
    const paper = page.locator('.ProseMirror')
    await expect(paper).toBeVisible()
    const original = await paper.evaluate(element => ({ width: (element as HTMLElement).offsetWidth, height: (element as HTMLElement).offsetHeight }))
    await page.setViewportSize({ width: 480, height: 800 })
    await expect.poll(async () => (await paper.boundingBox())!.width).toBeLessThanOrEqual(457)
    const narrow = await paper.evaluate(element => ({ width: (element as HTMLElement).offsetWidth, height: (element as HTMLElement).offsetHeight }))
    // CSS zoom rounds physical pixels when reporting unscaled offset dimensions.
    expect(Math.abs(narrow.width - original.width)).toBeLessThanOrEqual(1)
    expect(Math.abs(narrow.height - original.height)).toBeLessThanOrEqual(1)
    await page.getByLabel('editor.textColor', { exact: true }).click()
    const popup = page.getByRole('dialog')
    await expect(popup).toBeVisible()
    const bounds = (await popup.boundingBox())!
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(480)
    await page.screenshot({ path: test.info().outputPath('narrow-editor.png') })
  })
}

// Isolate renderer geometry from native file APIs, using the EditorContent wrapper hierarchy.
async function mount(page: Page, mode = 'actual', zoom = 1, width = 820) {
  await page.setViewportSize({ width, height: 700 })
  await page.setContent(`<style>${theme}
    * { box-sizing: border-box } body { margin: 0 }
    .app, .viewport { height: 600px; overflow: hidden; position: relative }
    .header { height: 50px }
    ${css}</style>
    <div class="app"><header class="header">App header</header><div class="viewport">
      <section class="editor-shell markdoc-editor-shell" data-markdoc-print-root data-markdoc-view-mode="${mode}" style="--editor-zoom:${zoom}">
        <div class="markdoc-editor-popover-layer" data-markdoc-print-hidden><div class="markdoc-formatting-toolbar-wrap"><div class="markdoc-formatting-toolbar">Toolbar</div></div></div>
        <div class="markdoc-document-canvas markdoc-editor-scroll"><div class="markdoc-tiptap-editor"><div>
          <div class="ProseMirror" contenteditable="true"><h1>Document layout</h1>${'<p>Editable document content.</p>'.repeat(90)}<p id="end">End of document</p></div>
        </div></div></div>
      </section>
    </div></div>`)
}

test('paper and canvas have valid, distinct opaque theme backgrounds', async ({ page }) => {
  await mount(page)
  const colors = await page.evaluate(() => ['.ProseMirror', '.markdoc-document-canvas'].map(selector => getComputedStyle(document.querySelector(selector)!).backgroundColor))
  expect(colors[0]).not.toBe('rgba(0, 0, 0, 0)')
  expect(colors[1]).not.toBe('rgba(0, 0, 0, 0)')
  expect(colors[0]).not.toBe(colors[1])
})

test('zoomed actual-size paper remains reachable on both horizontal edges', async ({ page }) => {
  await mount(page, 'actual', 2)
  const canvas = page.locator('.markdoc-document-canvas')
  const paper = page.locator('.ProseMirror')
  const bounds = (await canvas.boundingBox())!
  expect((await paper.boundingBox())!.x).toBeGreaterThanOrEqual(bounds.x)
  await canvas.evaluate(element => { element.scrollLeft = element.scrollWidth })
  const right = (await paper.boundingBox())!
  expect(right.x + right.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1)
})

test('printing a dark-themed document uses readable paper colors for code blocks', async ({ page }) => {
  await mount(page)
  await page.addStyleTag({ content: ':root { --muted: #222; --muted-foreground: #bbb; --border: #333; }' })
  await page.locator('.ProseMirror').evaluate(paper => {
    const pre = document.createElement('pre')
    pre.textContent = 'const readable = true'
    paper.appendChild(pre)
    document.documentElement.dataset.markdocPrinting = 'true'
  })
  await page.addStyleTag({ content: buildPrintPageCss(undefined) })
  await page.emulateMedia({ media: 'print' })
  const colors = await page.locator('pre').evaluate(element => {
    const style = getComputedStyle(element)
    return { background: style.backgroundColor, color: style.color }
  })
  expect(colors.background).toBe('rgb(243, 244, 246)')
  expect(colors.color).toBe('rgb(17, 17, 17)')
})

for (const mode of ['fit', 'actual', 'wide']) {
  test(`print removes screen clipping and width constraints in ${mode} mode`, async ({ page }) => {
    await mount(page, mode, 2)
    await page.addStyleTag({ content: buildPrintPageCss(undefined) })
    await page.evaluate(() => { document.documentElement.dataset.markdocPrinting = 'true' })
    await page.emulateMedia({ media: 'print' })
    const result = await page.locator('#end').evaluate(end => {
      const clipping: string[] = []
      for (let parent = end.parentElement; parent; parent = parent.parentElement) {
        if (['hidden', 'auto', 'scroll', 'clip'].includes(getComputedStyle(parent).overflowY)) clipping.push(parent.className)
      }
      const paper = document.querySelector('.ProseMirror')!.getBoundingClientRect()
      const wrapper = document.querySelector('.markdoc-tiptap-editor')!
      return { clipping, top: paper.top, width: paper.width, minWidth: getComputedStyle(wrapper).minWidth, viewport: window.innerWidth }
    })
    expect(result.clipping).toEqual([])
    expect(result.top).toBe(0)
    expect(result.minWidth).toBe('0px')
    expect(result.width).toBeLessThanOrEqual(result.viewport)
  })
}
for (const width of [600, 1200]) {
  test(`bottom tools and status share an opaque strip at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/e2e/fixtures/editor.html?status')
    const layer = page.getByTestId('markdoc-editor-toolbar-layer')
    await expect(layer.getByText('12345 characters')).toBeVisible()
    const status = (await page.locator('.markdoc-editor-status').boundingBox())!
    const tools = (await page.getByRole('toolbar').boundingBox())!
    const canvas = (await page.getByTestId('markdoc-document-canvas').boundingBox())!
    const strip = (await layer.boundingBox())!
    expect(status.x + status.width).toBeLessThanOrEqual(width)
    expect(tools.x + tools.width).toBeLessThanOrEqual(status.x)
    expect(canvas.y + canvas.height).toBeLessThanOrEqual(strip.y + 1)
    expect(await layer.evaluate(el => getComputedStyle(el).backgroundColor)).not.toMatch(/transparent|rgba\([^)]*,\s*0\)/)
    await page.screenshot({ path: `/tmp/markdoc-toolbar-${width}.png` })
    await page.emulateMedia({ media: 'print' })
    await expect(layer).toBeHidden()
  })
}
test('daily document typography uses a 14px body and restrained headings', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.goto('/e2e/fixtures/editor.html')
  await expect(page.locator('[data-editor-ready="true"]')).toBeVisible()
  await page.evaluate(() => window.markdocFixture!.loadExternal('# Daily notes\n\nBody text.\n\n## Section\n\n### Detail\n\n#### Subsection\n\n##### Note\n\n###### Aside'))
  const sizes = await page.locator('.ProseMirror').evaluate(root => {
    return ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map(selector => getComputedStyle(root.querySelector(selector)!).fontSize)
  })
  expect(sizes).toEqual(['14px', '22px', '18px', '16px', '14px', '14px', '14px'])
  await page.emulateMedia({ media: 'print' })
  expect(await page.locator('.ProseMirror p').first().evaluate(el => getComputedStyle(el).fontSize)).toBe('14px')
})
