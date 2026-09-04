import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DocumentEditorAdapter } from '../editor-adapter'
import { EditorToolbar } from '../EditorToolbar'

function mockAdapter(): DocumentEditorAdapter {
  return {
    getMarkdown: vi.fn(() => ''),
    setMarkdown: vi.fn(),
    focus: vi.fn(),
    blur: vi.fn(),
    canRun: vi.fn(() => true),
    isActive: vi.fn(() => false),
    run: vi.fn(() => true),
    insertImage: vi.fn(),
    insertAttachment: vi.fn(),
    scrollToOutlineItem: vi.fn(() => false),
    dispose: vi.fn(),
  }
}

describe('EditorToolbar', () => {
  it('applies links only after the user provides a URL', () => {
    const adapter = mockAdapter()
    const prompt = vi.spyOn(window, 'prompt').mockReturnValueOnce('')
    render(<EditorToolbar adapter={adapter} revision={0} />)

    fireEvent.click(screen.getByLabelText('editor.toolbar.link'))
    expect(adapter.run).not.toHaveBeenCalledWith('link', expect.anything())

    prompt.mockReturnValueOnce('https://example.test')
    fireEvent.click(screen.getByLabelText('editor.toolbar.link'))

    expect(adapter.run).toHaveBeenCalledWith('link', { href: 'https://example.test' })
    prompt.mockRestore()
  })

  it('clears text and background color without clearing block formatting', () => {
    const adapter = mockAdapter()
    render(<EditorToolbar adapter={adapter} revision={0} />)

    fireEvent.click(screen.getByLabelText('editor.textColor'))
    fireEvent.click(screen.getByText('editor.clearTextColor'))
    expect(adapter.run).toHaveBeenCalledWith('clearTextColor')

    fireEvent.click(screen.getByLabelText('editor.backgroundColor'))
    fireEvent.click(screen.getByText('editor.clearBackgroundColor'))
    expect(adapter.run).toHaveBeenCalledWith('clearBackgroundColor')
    expect(adapter.run).not.toHaveBeenCalledWith('clearFormatting')
  })

  it('uploads image files even when the platform leaves the MIME type empty', async () => {
    const adapter = mockAdapter()
    const onImagePaste = vi.fn(async () => 'assets/shot.png')
    render(<EditorToolbar adapter={adapter} revision={0} onImagePaste={onImagePaste} />)

    const input = document.querySelector<HTMLInputElement>('.markdoc-toolbar-upload-input')!
    const file = new File([new Uint8Array([1])], 'Screenshot 2026-08-14 at 14.28.57.png', { type: '' })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(onImagePaste).toHaveBeenCalledWith(file))
    expect(adapter.run).toHaveBeenCalledWith('image', { src: 'assets/shot.png', alt: 'image' })
  })
})
