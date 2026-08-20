import { describe, expect, it, vi } from 'vitest'
import { resolveEditorLanguage } from '../Editor'
import { VditorEditorAdapter } from '../VditorEditorAdapter'
import { PackageSecurityPolicy } from '../../../services/security/PackageSecurityPolicy'
import { enforceRemoteResourcePolicy, getCanonicalEditorMarkdown, installRemoteResourceRenderBoundary, restoreBlockedResources } from '../resource-policy'

describe('VditorEditorAdapter', () => {
  it('gets and sets markdown without exposing Vditor to document services', () => {
    const vditor = {
      getValue: vi.fn(() => '# Hello'),
      setValue: vi.fn(),
      focus: vi.fn(),
      insertValue: vi.fn(),
    }
    const adapter = new VditorEditorAdapter(vditor)

    expect(adapter.getMarkdown()).toBe('# Hello')
    adapter.setMarkdown('# Changed')

    expect(vditor.setValue).toHaveBeenCalledWith('# Changed')
  })

  it('focuses the editor', () => {
    const vditor = {
      getValue: vi.fn(),
      setValue: vi.fn(),
      focus: vi.fn(),
      insertValue: vi.fn(),
    }
    const adapter = new VditorEditorAdapter(vditor)

    adapter.focus()

    expect(vditor.focus).toHaveBeenCalledOnce()
  })

  it('inserts images using clean relative markdown references', () => {
    const vditor = {
      getValue: vi.fn(),
      setValue: vi.fn(),
      focus: vi.fn(),
      insertValue: vi.fn(),
    }
    const adapter = new VditorEditorAdapter(vditor)

    adapter.insertImage({
      markdownPath: 'assets/a.png',
      absolutePath: '/tmp/a.png',
      kind: 'image',
      mimeType: 'image/png',
    })

    expect(vditor.insertValue).toHaveBeenCalledWith('![image](assets/a.png)')
  })

  it('inserts attachments using clean relative markdown references', () => {
    const vditor = {
      getValue: vi.fn(),
      setValue: vi.fn(),
      focus: vi.fn(),
      insertValue: vi.fn(),
    }
    const adapter = new VditorEditorAdapter(vditor)

    adapter.insertAttachment({
      markdownPath: 'assets/report.pdf',
      absolutePath: '/tmp/report.pdf',
      kind: 'attachment',
      mimeType: 'application/pdf',
    })

    expect(vditor.insertValue).toHaveBeenCalledWith('[assets/report.pdf](assets/report.pdf)')
  })
})

describe('resolveEditorLanguage', () => {
  it('keeps the locale override stable when the ui language changes', () => {
    expect(resolveEditorLanguage({
      uiLanguage: 'zh',
      editorLanguage: 'en_US',
    }, 'zh')).toBe('en_US')
    expect(resolveEditorLanguage({
      uiLanguage: 'en',
      editorLanguage: 'en_US',
    }, 'en')).toBe('en_US')
  })

  it('falls back to the current i18n language when no editor override is supplied', () => {
    expect(resolveEditorLanguage(undefined, 'en')).toBe('en_US')
    expect(resolveEditorLanguage(undefined, 'zh')).toBe('zh_CN')
  })
})

describe('rendered editor resource policy', () => {
  it('blocks Markdown-rendered remote images without changing canonical Markdown', () => {
    const markdown = '![remote](https://images.example.com/diagram.png)\n![local](assets/diagram.png)'
    const root = document.createElement('div')
    root.innerHTML = '<img id="remote" src="https://images.example.com/diagram.png"><img id="local" src="assets/diagram.png">'

    enforceRemoteResourcePolicy(root, PackageSecurityPolicy.default())

    expect(root.querySelector('#remote')?.hasAttribute('src')).toBe(false)
    expect(root.querySelector('#local')?.getAttribute('src')).toBe('assets/diagram.png')
    expect(markdown).toBe('![remote](https://images.example.com/diagram.png)\n![local](assets/diagram.png)')
    const canonicalClone = root.cloneNode(true) as HTMLElement
    restoreBlockedResources(canonicalClone)
    expect(canonicalClone.querySelector('#remote')?.getAttribute('src')).toBe('https://images.example.com/diagram.png')
  })

  it('blocks raw HTML images, styles, fonts, and scripts at the rendered DOM boundary', () => {
    const root = document.createElement('div')
    root.innerHTML = [
      '<img id="html-image" src="https://cdn.example.com/image.png">',
      '<link id="style" rel="stylesheet" href="https://cdn.example.com/site.css">',
      '<style id="font">@font-face { src: url(https://cdn.example.com/font.woff2); }</style>',
      '<script id="script" src="https://cdn.example.com/app.js"></script>',
    ].join('')

    enforceRemoteResourcePolicy(root, PackageSecurityPolicy.default())

    expect(root.querySelector('#html-image')?.hasAttribute('src')).toBe(false)
    expect(root.querySelector('#style')?.hasAttribute('href')).toBe(false)
    expect(root.querySelector('#font')?.textContent).toBe('')
    expect(root.querySelector('#script')?.hasAttribute('src')).toBe(false)
  })

  it('keeps explicitly allowed rendered resource types', () => {
    const root = document.createElement('div')
    root.innerHTML = '<img src="https://images.example.com/diagram.png">'

    enforceRemoteResourcePolicy(root, PackageSecurityPolicy.default().allowResourceType('image'))

    expect(root.querySelector('img')?.getAttribute('src')).toBe('https://images.example.com/diagram.png')
  })

  it('serializes canonical Markdown from a restored clone of the blocked editor DOM', () => {
    const editable = document.createElement('div')
    editable.innerHTML = '<img src="https://images.example.com/diagram.png">'
    enforceRemoteResourcePolicy(editable, PackageSecurityPolicy.default())
    const VditorDOM2Md = vi.fn((html: string) => html)
    const editor = {
      getValue: vi.fn(() => 'mutated'),
      vditor: {
        currentMode: 'wysiwyg',
        wysiwyg: { element: editable },
        ir: { element: editable },
        lute: { VditorDOM2Md, VditorIRDOM2Md: vi.fn() },
      },
    }

    expect(getCanonicalEditorMarkdown(editor)).toContain('src="https://images.example.com/diagram.png"')
    expect(editor.getValue).not.toHaveBeenCalled()
  })

  it('sanitizes Vditor HTML before it reaches the editable renderer DOM', () => {
    const editor = {
      getValue: vi.fn(),
      vditor: {
        currentMode: 'wysiwyg',
        wysiwyg: { element: document.createElement('div') },
        ir: { element: document.createElement('div') },
        lute: {
          VditorDOM2Md: vi.fn(),
          VditorIRDOM2Md: vi.fn(),
          Md2VditorDOM: vi.fn(() => '<img src="https://images.example.com/diagram.png">'),
        },
      },
    }

    installRemoteResourceRenderBoundary(editor, () => PackageSecurityPolicy.default())
    const rendered = editor.vditor.lute.Md2VditorDOM!('![remote](https://images.example.com/diagram.png)')

    expect(rendered).not.toContain(' src=')
    expect(rendered).toContain('data-markdoc-original-src="https://images.example.com/diagram.png"')
  })
})
