import { Editor as TiptapEditor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createMarkDocExtensions } from '../../../editor-core/markdoc-extensions'
import { PackageSecurityPolicy } from '../../../services/security/PackageSecurityPolicy'
import { enforceRemoteResourcePolicy } from '../../../editor-core/resource-security'
import { TiptapEditorAdapter } from '../TiptapEditorAdapter'

let editor: TiptapEditor | null = null

afterEach(() => {
  editor?.destroy()
  editor = null
})

function createEditor(content = '') {
  editor = new TiptapEditor({
    extensions: createMarkDocExtensions({}),
    content,
    contentType: 'markdown',
  })
  return editor
}

describe('TiptapEditorAdapter', () => {
  it('gets and sets canonical Markdown through the MarkDoc adapter contract', () => {
    const adapter = new TiptapEditorAdapter(createEditor('# Title'), document.createElement('div'))

    adapter.setMarkdown('## Changed')

    expect(adapter.getMarkdown()).toContain('## Changed')
  })

  it('runs MarkDoc command ids without exposing Tiptap to document services', () => {
    const adapter = new TiptapEditorAdapter(createEditor('Text'), document.createElement('div'))

    expect(adapter.run('bold')).toBe(true)
    expect(adapter.canRun('bold')).toBe(true)
  })

  it('inserts package-relative images and attachments as clean Markdown', () => {
    const adapter = new TiptapEditorAdapter(createEditor(''), document.createElement('div'))

    adapter.insertImage({ markdownPath: 'assets/a.png', absolutePath: '/tmp/a.png', kind: 'image' })
    adapter.insertAttachment({ markdownPath: 'assets/report.pdf', absolutePath: '/tmp/report.pdf', kind: 'attachment' })

    expect(adapter.getMarkdown()).toContain('![image](assets/a.png)')
    expect(adapter.getMarkdown()).toContain('[assets/report.pdf](assets/report.pdf)')
  })

  it('normalizes raw HTML images when replacing editor content', () => {
    const adapter = new TiptapEditorAdapter(createEditor(''), document.createElement('div'))

    adapter.setMarkdown('<img src="assets/docx/media/image1.png" style="width:6.98in;height:8.08in" />')

    expect(adapter.getMarkdown()).toContain('![image](assets/docx/media/image1.png "width=6.98in;height=8.08in")')
  })

  it('keeps canonical Markdown when rendered local image URLs are rewritten for display', () => {
    const root = document.createElement('div')
    const adapter = new TiptapEditorAdapter(createEditor('![image](assets/a.png)'), root)
    root.appendChild(editor!.view.dom)

    enforceRemoteResourcePolicy(root, PackageSecurityPolicy.default(), () => 'blob:asset-a')

    expect(root.querySelector('img')?.getAttribute('src')).toBe('blob:asset-a')
    expect(adapter.getMarkdown()).toContain('![image](assets/a.png)')
  })

  it('serializes text and background colors into reloadable MarkDoc Markdown', () => {
    const adapter = new TiptapEditorAdapter(createEditor('colored'), document.createElement('div'))

    editor!.commands.setTextSelection({ from: 1, to: 8 })
    adapter.run('textColor', { color: '#dc2626' })
    expect(adapter.getMarkdown()).toContain('<span style="color: #dc2626">colored</span>')

    adapter.setMarkdown('marked')
    editor!.commands.setTextSelection({ from: 1, to: 7 })
    adapter.run('backgroundColor', { color: '#fef3c7' })
    expect(adapter.getMarkdown()).toContain('<mark data-color="#fef3c7" style="background-color: #fef3c7; color: inherit">marked</mark>')
  })
})
