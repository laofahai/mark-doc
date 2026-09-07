import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Editor from '../Editor'
import { debugLog } from '../../../services/debug-log'
import * as markdownCodec from '../../../editor-core/markdown-codec'

vi.mock('../../../services/debug-log', () => ({
  debugLog: vi.fn(),
}))

describe('MarkDoc editor shell', () => {
  it('does not normalize the entire document again when only zoom changes', async () => {
    const prepare = vi.spyOn(markdownCodec, 'prepareMarkdownForEditor')
    const content = '# Long document\n\n' + 'Paragraph.\n\n'.repeat(100)
    const { rerender } = render(<Editor content={content} zoom={100} />)
    await screen.findByRole('toolbar')
    await waitFor(() => expect(screen.getByLabelText('editor.textColor')).not.toBeDisabled())
    const calls = prepare.mock.calls.length
    rerender(<Editor content={content} zoom={120} />)
    expect(prepare).toHaveBeenCalledTimes(calls)
    prepare.mockRestore()
  })
  it('renders a MarkDoc-owned toolbar instead of moving library DOM', async () => {
    render(<Editor content="# Title" onChange={() => {}} />)

    expect(await screen.findByRole('toolbar', { name: 'editor.formattingToolbar' })).toBeInTheDocument()
    expect(document.querySelector('.markdoc-formatting-toolbar')).toBeInTheDocument()
  })

  it('applies document page layout attributes and CSS variables to the editor surface', async () => {
    render(
      <Editor
        content="# Title"
        onChange={() => {}}
        viewMode="actual"
        pageLayout={{
          size: 'a4',
          orientation: 'landscape',
          margins: { top: '14mm', right: '16mm', bottom: '14mm', left: '16mm' },
        }}
      />,
    )

    const shell = await screen.findByTestId('markdoc-editor-shell')
    expect(shell).toHaveAttribute('data-markdoc-view-mode', 'actual')
    expect(shell).toHaveAttribute('data-markdoc-page-size', 'a4')
    expect(shell).toHaveAttribute('data-markdoc-page-orientation', 'landscape')
    expect(shell).toHaveStyle({
      '--markdoc-page-width': '297mm',
      '--markdoc-page-height': '210mm',
      '--markdoc-page-margin-top': '14mm',
      '--markdoc-page-margin-right': '16mm',
      '--markdoc-page-margin-bottom': '14mm',
      '--markdoc-page-margin-left': '16mm',
    })
    expect(screen.getByTestId('markdoc-document-canvas')).toBeInTheDocument()
    expect(screen.getByTestId('markdoc-editor-toolbar-layer')).toContainElement(
      screen.getByRole('toolbar', { name: 'editor.formattingToolbar' }),
    )
    expect(await screen.findByTestId('markdoc-editor-content')).toHaveAttribute('data-markdoc-document-page', 'true')
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

  it('opens editor toolbar popovers upward from the bottom toolbar', async () => {
    render(<Editor content="colored text" onChange={() => {}} />)

    const colorButton = await screen.findByLabelText('editor.textColor')
    await waitFor(() => expect(colorButton).not.toBeDisabled())
    fireEvent.click(colorButton)

    expect(screen.getByRole('dialog', { name: 'editor.textColor' })).toHaveAttribute('data-placement', 'top')
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
