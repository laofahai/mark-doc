import { describe, expect, it, vi } from 'vitest'
import { VditorEditorAdapter } from '../VditorEditorAdapter'

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
