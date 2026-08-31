import { invoke } from '@tauri-apps/api/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  copyFile,
  authorizeDocumentPath,
  readDir,
  readTextFile,
  removeFile,
  selectDocumentFile,
  selectDocumentFolder,
  selectSavePath,
  writeTextFile,
} from '../native-file'

describe('native file access', () => {
  beforeEach(() => vi.clearAllMocks())

  it('routes document file dialogs through backend authorization commands', async () => {
    vi.mocked(invoke).mockResolvedValueOnce('/docs/report.mdoc')
    vi.mocked(invoke).mockResolvedValueOnce('/docs')
    vi.mocked(invoke).mockResolvedValueOnce('/docs/report.mdoc')

    await expect(selectDocumentFile({
      filters: [{ name: 'MarkDoc', extensions: ['mdoc'] }],
    })).resolves.toBe('/docs/report.mdoc')
    await expect(selectDocumentFolder()).resolves.toBe('/docs')
    await expect(authorizeDocumentPath('/docs/report.mdoc')).resolves.toBe('/docs/report.mdoc')

    expect(invoke).toHaveBeenNthCalledWith(1, 'select_document_file', {
      options: { filters: [{ name: 'MarkDoc', extensions: ['mdoc'] }] },
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'select_document_folder')
    expect(invoke).toHaveBeenNthCalledWith(3, 'authorize_document_path', { path: '/docs/report.mdoc' })
  })

  it('routes save dialogs and filesystem operations through backend authorization commands', async () => {
    vi.mocked(invoke).mockResolvedValueOnce('/exports/report.mdoc')
    vi.mocked(invoke).mockResolvedValueOnce('# Report')
    vi.mocked(invoke).mockResolvedValueOnce(undefined)
    vi.mocked(invoke).mockResolvedValueOnce(12)
    vi.mocked(invoke).mockResolvedValueOnce(undefined)
    vi.mocked(invoke).mockResolvedValueOnce([{ name: 'report.md', path: '/docs/report.md', isDirectory: false, isFile: true }])

    await expect(selectSavePath({
      defaultPath: 'report.mdoc',
      filters: [{ name: 'MarkDoc', extensions: ['mdoc'] }],
    })).resolves.toBe('/exports/report.mdoc')
    await expect(readTextFile('/docs/report.md')).resolves.toBe('# Report')
    await writeTextFile('/docs/report.md', '# Saved')
    await expect(copyFile('/docs/assets/a.png', '/tmp/markdoc/save/assets/a.png')).resolves.toBe(12)
    await removeFile('/tmp/markdoc/recovery/doc.md')
    await expect(readDir('/docs')).resolves.toEqual([
      { name: 'report.md', path: '/docs/report.md', isDirectory: false, isFile: true },
    ])

    expect(invoke).toHaveBeenNthCalledWith(1, 'select_save_path', {
      options: {
        defaultPath: 'report.mdoc',
        filters: [{ name: 'MarkDoc', extensions: ['mdoc'] }],
      },
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'read_text_file', { path: '/docs/report.md' })
    expect(invoke).toHaveBeenNthCalledWith(3, 'write_text_file', { path: '/docs/report.md', contents: '# Saved' })
    expect(invoke).toHaveBeenNthCalledWith(4, 'copy_file', {
      sourcePath: '/docs/assets/a.png',
      targetPath: '/tmp/markdoc/save/assets/a.png',
    })
    expect(invoke).toHaveBeenNthCalledWith(5, 'remove_file', { path: '/tmp/markdoc/recovery/doc.md' })
    expect(invoke).toHaveBeenNthCalledWith(6, 'read_dir', { path: '/docs' })
  })
})
