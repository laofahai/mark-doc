import { Editor, type JSONContent } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { createMarkdownCodec, prepareMarkdownForEditor } from '../markdown-codec'
import { createMarkDocExtensions } from '../markdoc-extensions'
import { findLocalAssetReferences } from '../../services/assets/AssetManager'
import { MarkdownImporter } from '../../services/importers/MarkdownImporter'
import { resolveSaveTarget } from '../../services/document/save-strategy'

const plain = '| A   | B   |\n| --- | --- |\n| x   | y   |'

function sizedTable(widths: (number[] | null)[] = [[160], [240]]) {
  const doc = createMarkdownCodec().parse(plain)
  for (const row of doc.content![0].content!) {
    row.content!.forEach((cell, index) => {
      cell.attrs = { ...cell.attrs, colwidth: widths[index] }
    })
  }
  return doc
}

function table(document: JSONContent) {
  return document.content!.find(node => node.type === 'table')!
}

describe('table width persistence', () => {
  it('keeps ordinary pipe tables unchanged', () => {
    expect(createMarkdownCodec().roundTrip(plain).trim()).toBe(plain)
  })

  it.each([[[160], [240]], [[160], null], [null, [240]]])('preserves column widths %j in HTML across repeated round trips', (...widths) => {
    const codec = createMarkdownCodec()
    const doc = sizedTable(widths as (number[] | null)[])
    const serialized = codec.serialize(doc)
    expect(serialized).toContain('<table')
    expect(serialized).toContain('colwidth=')
    const restored = codec.parse(serialized)
    table(restored).content!.forEach(row => {
      expect(row.content!.map(cell => cell.attrs?.colwidth)).toEqual(widths)
    })
    expect(codec.serialize(restored)).toBe(serialized)
    expect(codec.roundTrip(codec.roundTrip(serialized))).toBe(serialized)
  })

  it('preserves merged cells even without explicit widths', () => {
    const codec = createMarkdownCodec()
    const doc = sizedTable([null, null])
    const header = table(doc).content![0]
    header.content![0].attrs = { ...header.content![0].attrs, colspan: 2 }
    header.content!.splice(1, 1)
    const serialized = codec.serialize(doc)
    expect(serialized).toContain('colspan="2"')
    expect(table(codec.parse(serialized)).content![0].content).toHaveLength(1)
    expect(codec.roundTrip(serialized)).toBe(serialized)
  })

  it('preserves rowspan and per-column widths on a merged cell', () => {
    const codec = createMarkdownCodec()
    const source = '<table><tbody><tr><th colspan="2" colwidth="160,240"><p>Header</p></th></tr><tr><td rowspan="2" colwidth="160"><p>A</p></td><td colwidth="240"><p>B</p></td></tr><tr><td colwidth="240"><p>C</p></td></tr></tbody></table>'
    const serialized = codec.roundTrip(source)
    const restored = table(codec.parse(serialized))
    expect(restored.content![0].content![0].attrs).toMatchObject({ colspan: 2, colwidth: [160, 240] })
    expect(restored.content![1].content![0].attrs).toMatchObject({ rowspan: 2, colwidth: [160] })
    expect(codec.roundTrip(serialized)).toBe(serialized)
  })

  it('keeps HTML widths compatible with Markdown import and package-save suggestions', () => {
    const codec = createMarkdownCodec()
    const doc = sizedTable()
    table(doc).content![1].content![0].content!.push({ type: 'image', attrs: { src: 'assets/photo.png' } })
    const markdown = codec.serialize(doc)
    const imported = new MarkdownImporter().import('/docs/table.md', markdown)
    expect(imported.ok).toBe(true)
    if (!imported.ok) throw new Error('Import failed')
    expect(imported.value.document.markdown).toBe(markdown)
    expect(imported.value.packageResourceReferences).toContain('assets/photo.png')
    expect(resolveSaveTarget(imported.value.document).allowedKinds).toContain('markdown')
    expect(resolveSaveTarget({ ...imported.value.document, dirty: { markdown: true, assets: true, presentation: false } }).defaultKind).toBe('mdoc')
  })

  it('preserves rich content and package image references inside HTML tables', () => {
    const codec = createMarkdownCodec()
    const doc = sizedTable()
    table(doc).content![1].content![0].content = [
      { type: 'paragraph', content: [
        { type: 'text', text: '<literal> & bold', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' link', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
      ] },
      { type: 'image', attrs: { src: 'assets/photo.png', alt: 'Photo', title: 'Original' } },
    ]
    const serialized = codec.serialize(doc)
    expect(prepareMarkdownForEditor(serialized)).toBe(serialized)
    expect(findLocalAssetReferences(serialized)).toContain('assets/photo.png')
    const restored = codec.parse(serialized)
    expect(table(restored).content![1].content![0].content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'image', attrs: expect.objectContaining({ src: 'assets/photo.png' }) }),
    ]))
    expect(codec.roundTrip(serialized)).toBe(serialized)
  })

  it('uses the same serializer for editor updates, getMarkdown and the independent codec', () => {
    const codec = createMarkdownCodec()
    const updates: string[] = []
    const editor = new Editor({ extensions: createMarkDocExtensions(), content: codec.parse(plain), onUpdate: ({ editor }) => updates.push(editor.getMarkdown()) })
    try {
      let cellPosition = 0
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'tableHeader' && !cellPosition) cellPosition = pos
      })
      editor.view.dispatch(editor.state.tr.setNodeMarkup(cellPosition, undefined, {
        ...editor.state.doc.nodeAt(cellPosition)!.attrs, colwidth: [180],
      }))
      const markdown = editor.getMarkdown()
      expect(markdown).toContain('colwidth="180"')
      expect(updates.at(-1)).toBe(markdown)
      expect(codec.normalize(markdown)).toBe(codec.serialize(editor.getJSON()))
      expect(editor.commands.undo()).toBe(true)
      expect(editor.getMarkdown()).not.toContain('colwidth=')
      expect(editor.commands.redo()).toBe(true)
      expect(editor.getMarkdown()).toContain('colwidth="180"')
      editor.commands.setContent(prepareMarkdownForEditor(markdown), { contentType: 'markdown' })
      expect(table(editor.getJSON()).content![0].content![0].attrs?.colwidth).toEqual([180])
    } finally {
      editor.destroy()
    }
  })

  it('retains widths through row and column editing commands', () => {
    const codec = createMarkdownCodec()
    const editor = new Editor({ extensions: createMarkDocExtensions(), content: sizedTable() })
    try {
      editor.commands.setTextSelection(4)
      expect(editor.commands.addRowAfter()).toBe(true)
      expect(table(editor.getJSON()).content).toHaveLength(3)
      expect(editor.commands.addColumnAfter()).toBe(true)
      expect(table(editor.getJSON()).content![0].content).toHaveLength(3)
      expect(editor.commands.deleteColumn()).toBe(true)
      const restored = table(codec.parse(editor.getMarkdown()))
      expect(restored.content![0].content).toHaveLength(2)
      expect(restored.content![0].content![1].attrs?.colwidth).toEqual([240])
      expect(codec.serialize(codec.parse(editor.getMarkdown()))).toBe(codec.normalize(editor.getMarkdown()))
    } finally {
      editor.destroy()
    }
  })
})

describe('HTML image normalization boundaries', () => {
  it.each([
    '````html\n```\n<table><tr><td><img src="assets/x.png"></td></tr></table>\n````',
    '~~~html\n```\n<img src="assets/x.png">\n~~~',
    '    <table><tr><td><img src="assets/x.png"></td></tr></table>',
    '> ```html\n> <img src="assets/x.png">\n> ```',
    '- Example\n\n  ```html\n  <img src="assets/x.png">\n  ```',
    '`<img src="assets/x.png">`',
    '| Example |\n| --- |\n| `<img src="assets/x.png">` |',
  ])('does not rewrite literal code: %s', source => {
    expect(prepareMarkdownForEditor(source)).toBe(source)
  })

  it('keeps nested HTML tables intact while normalizing a following standalone image', () => {
    const html = '<table><tr><td><table><tr><td><img src="assets/a.png"></td></tr></table><img src="assets/b.png"></td></tr></table>'
    expect(prepareMarkdownForEditor(`${html}\n\n<img src="assets/c.png">`))
      .toBe(`${html}\n\n![image](assets/c.png)`)
  })

  it('keeps HTML table images intact across blank lines and ignores table tags in attributes and comments', () => {
    const html = '<table title="<table>">\n<!-- <table> -->\n\n<tr><td>\n\n<img src="assets/a.png">\n\n</td></tr>\n</table>'
    expect(prepareMarkdownForEditor(`${html}\n\n<img src="assets/b.png">`))
      .toBe(`${html}\n\n![image](assets/b.png)`)
  })

  it('does not collapse consecutive image tags into one image', () => {
    const images = '<img src="assets/a.png"><img src="assets/b.png">'
    expect(prepareMarkdownForEditor(images)).toBe('![image](assets/a.png)![image](assets/b.png)')
  })

  it('preserves literal replacement characters in image text', () => {
    expect(prepareMarkdownForEditor('<img src="assets/a.png" alt="$&">'))
      .toBe('![$&](assets/a.png)')
  })
})
