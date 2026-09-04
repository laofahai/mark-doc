import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Editor from '../Editor'
import { debugLog } from '../../../services/debug-log'

vi.mock('../../../services/debug-log', () => ({
  debugLog: vi.fn(),
}))

describe('MarkDoc editor shell', () => {
  it('renders a MarkDoc-owned toolbar instead of moving library DOM', async () => {
    render(<Editor content="# Title" onChange={() => {}} />)

    expect(await screen.findByRole('toolbar', { name: 'editor.formattingToolbar' })).toBeInTheDocument()
    expect(document.querySelector('.markdoc-formatting-toolbar')).toBeInTheDocument()
  })

  it('imports pasted screenshots into assets before inserting Markdown', async () => {
    const onImagePaste = vi.fn(async () => 'assets/pasted.png')
    const onChange = vi.fn()
    render(<Editor content="" onChange={onChange} onImagePaste={onImagePaste} />)

    const editor = await screen.findByTestId('markdoc-editor-content')
    const file = new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' })
    fireEvent.paste(editor, {
      clipboardData: {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
        files: [file],
        types: ['Files'],
      },
    })

    await waitFor(() => expect(onImagePaste).toHaveBeenCalledWith(file))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.stringContaining('assets/pasted.png')))
  })

  it('asks for a URL before applying a link command', async () => {
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('https://example.test')
    render(<Editor content="link target" onChange={() => {}} />)

    const linkButton = await screen.findByLabelText('editor.toolbar.link')
    await waitFor(() => expect(linkButton).not.toBeDisabled())
    fireEvent.click(linkButton)

    expect(prompt).toHaveBeenCalledWith('editor.linkUrl', 'https://')
    prompt.mockRestore()
  })

  it('logs pasted image import failures instead of leaving unhandled promises', async () => {
    const error = new Error('write failed')
    const onImagePaste = vi.fn(async () => { throw error })
    render(<Editor content="" onChange={() => {}} onImagePaste={onImagePaste} />)

    const editor = await screen.findByTestId('markdoc-editor-content')
    const file = new File([new Uint8Array([1])], 'shot.png', { type: 'image/png' })
    fireEvent.paste(editor, {
      clipboardData: {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
        files: [file],
      },
    })

    await waitFor(() => expect(debugLog).toHaveBeenCalledWith('editor.paste.failed', { cause: error }))
  })
})
