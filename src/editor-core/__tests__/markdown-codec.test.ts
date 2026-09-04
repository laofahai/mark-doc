import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createMarkdownCodec, prepareMarkdownForEditor } from '../markdown-codec'

const stableRoundTripFixtures = ['basic.md']

describe('MarkdownCodec', () => {
  it.each(stableRoundTripFixtures)('round-trips %s through Tiptap Markdown without lossy storage changes', file => {
    const codec = createMarkdownCodec()
    const markdown = readFileSync(join(process.cwd(), 'src/editor-core/fixtures/markdown', file), 'utf8')

    expect(codec.roundTrip(markdown)).toBe(codec.normalize(markdown))
  })

  it('normalizes raw HTML image tags into package-safe Markdown image references', () => {
    const codec = createMarkdownCodec()
    const markdown = readFileSync(join(process.cwd(), 'src/editor-core/fixtures/markdown/resources.md'), 'utf8')
    const roundTripped = codec.roundTrip(markdown)

    expect(roundTripped).toContain('![image](assets/docx/media/image1.png "width=6.98in;height=8.08in")')
    expect(roundTripped).not.toContain('<img')
    expect(roundTripped).not.toContain('&lt;img')
  })

  it('does not rewrite HTML image examples inside fenced code blocks', () => {
    const codec = createMarkdownCodec()
    const fenced = [
      '```html',
      '<img src="assets/example.png" />',
      '```',
    ].join('\n')
    const indented = '    <img src="assets/example.png" />'

    expect(codec.roundTrip(fenced)).toBe(fenced)
    expect(prepareMarkdownForEditor(indented)).toBe(indented)
    expect(codec.roundTrip(indented)).toContain('<img src="assets/example.png" />')
    expect(codec.roundTrip(indented)).not.toContain('![image](assets/example.png)')
  })

  it('round-trips MarkDoc text and background colors', () => {
    const codec = createMarkdownCodec()

    expect(codec.roundTrip('<span style="color: #dc2626">红色文字</span>')).toBe('<span style="color: #dc2626">红色文字</span>')
    expect(codec.roundTrip('<span style="background-color: #fef3c7">浅色背景</span>'))
      .toBe('<mark data-color="#fef3c7" style="background-color: #fef3c7; color: inherit">浅色背景</mark>')
    expect(codec.roundTrip('<mark data-color="#fef3c7" style="background-color: #fef3c7; color: inherit">浅色背景</mark>'))
      .toBe('<mark data-color="#fef3c7" style="background-color: #fef3c7; color: inherit">浅色背景</mark>')
  })

  it('keeps rich Markdown structure through the editor codec boundary', () => {
    const codec = createMarkdownCodec()
    const markdown = readFileSync(join(process.cwd(), 'src/editor-core/fixtures/markdown/rich-formatting.md'), 'utf8')

    expect(codec.roundTrip(markdown)).toBe([
      '---',
      'lang: zh-CN',
      '---',
      '',
      '## 表格',
      '',
      '',
      '| 阶段   | 说明          |',
      '| ---- | ----------- |',
      '| 信息收集 | 保留 Markdown |',
      '| 环境部署 | 保存为 mdoc    |',
      '',
      '',
      '<span style="color: #dc2626">红色文字</span>',
      '',
      '<mark data-color="#fef3c7" style="background-color: #fef3c7; color: inherit">浅色背景</mark>',
    ].join('\n'))
  })
})
