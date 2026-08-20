import { describe, expect, it, vi } from 'vitest'
import { filterRemoteMarkdownImages, resolveEditorLanguage } from '../Editor'
import { VditorEditorAdapter } from '../VditorEditorAdapter'
import { PackageSecurityPolicy } from '../../../services/security/PackageSecurityPolicy'

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

describe('filterRemoteMarkdownImages', () => {
  it('removes untrusted remote markdown images while preserving local images', () => {
    const markdown = '![remote](https://images.example.com/diagram.png)\n![local](assets/diagram.png)'

    expect(filterRemoteMarkdownImages(markdown, PackageSecurityPolicy.default())).toBe('remote\n![local](assets/diagram.png)')
  })

  it('passes remote markdown images after the policy allows images', () => {
    const markdown = '![remote](https://images.example.com/diagram.png)'
    const policy = PackageSecurityPolicy.default().allowResourceType('image')

    expect(filterRemoteMarkdownImages(markdown, policy)).toBe(markdown)
  })
})
