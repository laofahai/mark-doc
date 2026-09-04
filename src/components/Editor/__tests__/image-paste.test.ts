import { describe, expect, it, vi } from 'vitest'
import { handleEditorImagePaste, importEditorDataImage, importEditorUploadFiles } from '../image-paste'

describe('handleEditorImagePaste', () => {
  it('imports pasted clipboard images and inserts the returned asset link', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'screenshot.png', { type: 'image/png' })
    const preventDefault = vi.fn()
    const stopPropagation = vi.fn()
    const stopImmediatePropagation = vi.fn()
    const importImage = vi.fn().mockResolvedValue('assets/pasted-1.png')
    const insertValue = vi.fn()

    const handled = await handleEditorImagePaste({
      clipboardData: {
        items: [
          { kind: 'string', type: 'text/plain', getAsFile: () => null },
          { kind: 'file', type: 'image/png', getAsFile: () => file },
        ],
      },
      preventDefault,
      stopPropagation,
      stopImmediatePropagation,
    }, importImage, insertValue)

    expect(handled).toBe(true)
    expect(preventDefault).toHaveBeenCalled()
    expect(stopPropagation).toHaveBeenCalled()
    expect(stopImmediatePropagation).toHaveBeenCalled()
    expect(importImage).toHaveBeenCalledWith(file)
    expect(insertValue).toHaveBeenCalledWith('![image](assets/pasted-1.png)')
  })

  it('recognizes screenshot files when clipboard MIME type is empty', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'Screenshot 2026-08-14 at 14.28.57.png', { type: '' })
    const importImage = vi.fn().mockResolvedValue('assets/pasted-empty-type.png')
    const insertValue = vi.fn()

    const handled = await handleEditorImagePaste({
      clipboardData: {
        items: [
          { kind: 'file', type: '', getAsFile: () => file },
        ],
      },
      preventDefault: vi.fn(),
    }, importImage, insertValue)

    expect(handled).toBe(true)
    expect(importImage).toHaveBeenCalledWith(file)
    expect(insertValue).toHaveBeenCalledWith('![image](assets/pasted-empty-type.png)')
  })

  it('imports screenshot files exposed through clipboardData.files', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'Screenshot.png', { type: '' })
    const importImage = vi.fn().mockResolvedValue('assets/pasted-files.png')
    const insertValue = vi.fn()

    const handled = await handleEditorImagePaste({
      clipboardData: {
        items: [],
        files: [file],
      },
      preventDefault: vi.fn(),
    }, importImage, insertValue)

    expect(handled).toBe(true)
    expect(importImage).toHaveBeenCalledWith(file)
    expect(insertValue).toHaveBeenCalledWith('![image](assets/pasted-files.png)')
  })

  it('recognizes WebKit public.png clipboard item types', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'image', { type: '' })
    const importImage = vi.fn().mockResolvedValue('assets/pasted-public-png.png')
    const insertValue = vi.fn()

    const handled = await handleEditorImagePaste({
      clipboardData: {
        items: [
          { kind: 'file', type: 'public.png', getAsFile: () => file },
        ],
      },
      preventDefault: vi.fn(),
    }, importImage, insertValue)

    expect(handled).toBe(true)
    expect(importImage).toHaveBeenCalledWith(file)
    expect(insertValue).toHaveBeenCalledWith('![image](assets/pasted-public-png.png)')
  })

  it('imports uploaded image files through the same asset pipeline', async () => {
    const png = new File([new Uint8Array([1])], 'screenshot.png', { type: 'image/png' })
    const txt = new File(['notes'], 'notes.txt', { type: 'text/plain' })
    const importImage = vi.fn().mockResolvedValue('assets/pasted-2.png')
    const insertValue = vi.fn()

    const message = await importEditorUploadFiles([txt, png], importImage, insertValue)

    expect(message).toBeNull()
    expect(importImage).toHaveBeenCalledWith(png)
    expect(insertValue).toHaveBeenCalledWith('![image](assets/pasted-2.png)')
  })

  it('recognizes uploaded screenshot files when MIME type is empty', async () => {
    const file = new File([new Uint8Array([1])], 'Screenshot 2026-08-14 at 14.28.57.png', { type: '' })
    const importImage = vi.fn().mockResolvedValue('assets/pasted-upload-empty-type.png')
    const insertValue = vi.fn()

    await importEditorUploadFiles([file], importImage, insertValue)

    expect(importImage).toHaveBeenCalledWith(file)
    expect(insertValue).toHaveBeenCalledWith('![image](assets/pasted-upload-empty-type.png)')
  })

  it('converts pasted data image URLs into package assets', async () => {
    const importImage = vi.fn().mockResolvedValue('assets/pasted-data.png')

    const result = await importEditorDataImage('data:image/png;base64,AQID', importImage)

    expect(result).toBe('assets/pasted-data.png')
    const file = importImage.mock.calls[0][0] as File
    expect(file.name).toBe('pasted.png')
    expect(file.type).toBe('image/png')
    await expect(file.arrayBuffer()).resolves.toEqual(new Uint8Array([1, 2, 3]).buffer)
  })

  it('lets non-image paste events fall through', async () => {
    const preventDefault = vi.fn()

    const handled = await handleEditorImagePaste({
      clipboardData: {
        items: [
          { kind: 'string', type: 'text/plain', getAsFile: () => null },
        ],
      },
      preventDefault,
    }, vi.fn(), vi.fn())

    expect(handled).toBe(false)
    expect(preventDefault).not.toHaveBeenCalled()
  })
})
