import { invoke } from '@tauri-apps/api/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { copyFile, readTextFile, selectSavePath, writeTextFile } from '../../native-file'
import { DocumentService } from '../document-service'
import type { DocumentModel } from '../model'

vi.mock('../../native-file', () => ({
  copyFile: vi.fn(),
  readTextFile: vi.fn(),
  selectSavePath: vi.fn(),
  writeTextFile: vi.fn(),
}))

function markdownDocument(): DocumentModel {
  return {
    id: 'markdown-doc',
    source: { type: 'markdown', path: '/docs/readme.md' },
    workspace: {
      id: 'markdown-workspace',
      rootPath: '/docs',
      entryPath: '/docs/readme.md',
      storage: { type: 'virtual-markdown', markdownPath: '/docs/readme.md' },
    },
    markdown: '![diagram](assets/diagram.png)',
    metadata: {},
    assets: { references: ['assets/diagram.png'] },
    presentation: {},
    dirty: { markdown: true, assets: true, presentation: false },
  }
}

function newDocument(overrides: Partial<DocumentModel> = {}): DocumentModel {
  return {
    id: 'new-doc',
    source: { type: 'new' },
    workspace: {
      id: 'new-workspace',
      rootPath: '/tmp/markdoc/paste-source',
      entryPath: '/tmp/markdoc/paste-source/document.md',
      assetsPath: '/tmp/markdoc/paste-source/assets',
      storage: { type: 'temporary', rootPath: '/tmp/markdoc/paste-source', recoveryKey: 'new-doc' },
    },
    markdown: '# Untitled',
    metadata: {},
    assets: { references: [] },
    presentation: {},
    dirty: { markdown: true, assets: false, presentation: false },
    ...overrides,
  }
}

describe('DocumentService package saves', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(selectSavePath).mockResolvedValue('/exports/report.mdoc')
    vi.mocked(invoke).mockResolvedValue({ outputPath: '/exports/report.mdoc', recoveryPath: null })
  })

  it('saves a DOCX import with all referenced assets in the canonical package', async () => {
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === 'import_docx_to_workspace') {
        return {
          workspace_root: '/tmp/markdoc/docx-source',
          markdown_path: '/tmp/markdoc/docx-source/document.md',
          assets_path: '/tmp/markdoc/docx-source/assets',
        }
      }
      if (command === 'write_mdoc_package') {
        return { outputPath: '/exports/report.mdoc', recoveryPath: null }
      }
      throw new Error(`unexpected command: ${command}`)
    })
    vi.mocked(readTextFile).mockResolvedValueOnce('![diagram](assets/diagram.png)')
    const service = new DocumentService()
    const opened = await service.openPath('/docs/report.docx')
    expect(opened.ok).toBe(true)
    if (!opened.ok) return

    const saved = await service.saveDocument({
      ...opened.value.document,
      dirty: { ...opened.value.document.dirty, markdown: true },
    })

    expect(saved.ok).toBe(true)
    const writeCall = vi.mocked(invoke).mock.calls.find(([command]) => command === 'write_mdoc_package')
    expect(writeCall?.[1]).toMatchObject({
      input: {
        outputPath: '/exports/report.mdoc',
        entry: 'document.md',
        files: ['assets/diagram.png', 'document.md'],
      },
    })
  })

  it('converts plain Markdown in an isolated writer-owned workspace with document.md', async () => {
    const service = new DocumentService()

    const saved = await service.saveDocument(markdownDocument())

    expect(saved.ok).toBe(true)
    const writeCall = vi.mocked(invoke).mock.calls.find(([command]) => command === 'write_mdoc_package')
    const input = (writeCall?.[1] as { input: { workspaceRoot: string } }).input
    expect(input.workspaceRoot).not.toBe('/docs')
    expect(input).toMatchObject({
      outputPath: '/exports/report.mdoc',
      entry: 'document.md',
      files: ['assets/diagram.png', 'document.md'],
    })
    expect(writeTextFile).toHaveBeenCalledWith(`${input.workspaceRoot}/document.md`, '![diagram](assets/diagram.png)')
    expect(copyFile).toHaveBeenCalledWith('/docs/assets/diagram.png', `${input.workspaceRoot}/assets/diagram.png`)
  })

  it('defaults a new document first save to an mdoc package while keeping markdown available', async () => {
    const saved = await new DocumentService().saveDocument(newDocument())

    expect(saved.ok).toBe(true)
    expect(selectSavePath).toHaveBeenCalledWith({
      filters: [
        expect.objectContaining({ extensions: ['mdoc'] }),
        expect.objectContaining({ extensions: ['md'] }),
      ],
      defaultPath: 'untitled.mdoc',
    })
    expect(invoke).toHaveBeenCalledWith('write_mdoc_package', {
      input: expect.objectContaining({
        outputPath: '/exports/report.mdoc',
        entry: 'document.md',
        files: ['document.md'],
      }),
    })
  })

  it('drops text and legacy Word extensions from first package save defaults', async () => {
    vi.mocked(selectSavePath).mockResolvedValueOnce(null)

    await new DocumentService().saveDocument(newDocument({
      source: { type: 'docx', originalPath: '/docs/report.doc', workspacePath: '/tmp/markdoc/doc-source' },
    }))

    expect(selectSavePath).toHaveBeenCalledWith(expect.objectContaining({
      defaultPath: 'report.mdoc',
    }))

    vi.mocked(selectSavePath).mockClear()
    await new DocumentService().saveDocument({
      ...markdownDocument(),
      source: { type: 'markdown', path: '/docs/notes.txt' },
      workspace: {
        id: 'text-workspace',
        rootPath: '/docs',
        entryPath: '/docs/notes.txt',
        storage: { type: 'virtual-markdown', markdownPath: '/docs/notes.txt' },
      },
    })

    expect(selectSavePath).toHaveBeenCalledWith(expect.objectContaining({
      defaultPath: 'notes.mdoc',
    }))
  })

  it('saves a new document with pasted assets as a portable package', async () => {
    const document = newDocument({
      markdown: '![image](assets/pasted.png)',
      assets: { references: ['assets/pasted.png'] },
      dirty: { markdown: true, assets: true, presentation: false },
    })

    const saved = await new DocumentService().saveDocument(document)

    expect(saved.ok).toBe(true)
    const writeCall = vi.mocked(invoke).mock.calls.find(([command]) => command === 'write_mdoc_package')
    const input = (writeCall?.[1] as { input: { workspaceRoot: string } }).input
    expect(input).toMatchObject({
      outputPath: '/exports/report.mdoc',
      entry: 'document.md',
      files: ['assets/pasted.png', 'document.md'],
    })
    expect(input.workspaceRoot).not.toBe('/tmp/markdoc/paste-source')
    expect(writeTextFile).toHaveBeenCalledWith(`${input.workspaceRoot}/document.md`, '![image](assets/pasted.png)')
    expect(copyFile).toHaveBeenCalledWith(
      '/tmp/markdoc/paste-source/assets/pasted.png',
      `${input.workspaceRoot}/assets/pasted.png`,
    )
  })

  it('fails the package save when a referenced local asset cannot be copied', async () => {
    vi.mocked(copyFile).mockRejectedValueOnce(new Error('missing asset'))
    const service = new DocumentService()

    const saved = await service.saveDocument(markdownDocument())

    expect(saved.ok).toBe(false)
    if (!saved.ok) {
      expect(saved.error.code).toBe('save.failed')
      expect(saved.error.messageKey).toBe('errors.package.assetCopyFailed')
      expect(saved.error.params).toEqual({ path: 'assets/diagram.png' })
    }
    expect(invoke).not.toHaveBeenCalledWith('write_mdoc_package', expect.anything())
  })

  it('can explicitly save clean plain Markdown as an mdoc package from the suggestion action', async () => {
    const document = {
      ...markdownDocument(),
      dirty: { markdown: false, assets: false, presentation: false },
    }

    const saved = await new DocumentService().saveDocumentAsPackage(document)

    expect(saved.ok).toBe(true)
    const writeCall = vi.mocked(invoke).mock.calls.find(([command]) => command === 'write_mdoc_package')
    const input = (writeCall?.[1] as { input: { workspaceRoot: string } }).input
    expect(input).toMatchObject({
      outputPath: '/exports/report.mdoc',
      entry: 'document.md',
      files: ['assets/diagram.png', 'document.md'],
    })
    expect(writeTextFile).toHaveBeenCalledWith(`${input.workspaceRoot}/document.md`, '![diagram](assets/diagram.png)')
    expect(copyFile).toHaveBeenCalledWith('/docs/assets/diagram.png', `${input.workspaceRoot}/assets/diagram.png`)
  })

  it('preserves only safe quarantined package resources from the original archive', async () => {
    const document: DocumentModel = {
      ...markdownDocument(),
      source: { type: 'package', packagePath: '/docs/report.mdoc', extractedWorkspacePath: '/tmp/package' },
      workspace: {
        id: 'package-workspace',
        rootPath: '/tmp/package',
        entryPath: '/tmp/package/content/main.md',
        packageEntries: ['content/main.md', 'assets/chart.png'],
        packageQuarantined: [
          'presentation/reference.docx',
          'presentation/print.css',
          'assets/icon.svg',
          '../unsafe.txt',
          'https://example.com/remote.css',
        ],
        packageManifest: { format: 'markdoc-package', version: 1, entry: 'content/main.md' },
        storage: { type: 'temporary', rootPath: '/tmp/package', recoveryKey: 'package-doc' },
      },
      assets: { references: ['assets/chart.png'] },
      dirty: { markdown: true, assets: false, presentation: false },
    }

    const saved = await new DocumentService().saveDocument(document)

    expect(saved.ok).toBe(true)
    expect(invoke).toHaveBeenCalledWith('write_mdoc_package', {
      input: {
        workspaceRoot: '/tmp/package',
        outputPath: '/docs/report.mdoc',
        entry: 'content/main.md',
        files: ['assets/chart.png', 'content/main.md'],
        manifest: document.workspace.packageManifest,
        sourcePackagePath: '/docs/report.mdoc',
        preservedFiles: [
          'assets/icon.svg',
          'presentation/print.css',
          'presentation/reference.docx',
        ],
      },
    })
  })

  it('includes assets added after opening an existing package', async () => {
    const document: DocumentModel = {
      ...markdownDocument(),
      source: { type: 'package', packagePath: '/docs/report.mdoc', extractedWorkspacePath: '/tmp/package' },
      workspace: {
        id: 'package-workspace',
        rootPath: '/tmp/package',
        entryPath: '/tmp/package/document.md',
        packageEntries: ['document.md', 'assets/original.png'],
        packageManifest: { format: 'markdoc-package', version: 1, entry: 'document.md' },
        storage: { type: 'temporary', rootPath: '/tmp/package', recoveryKey: 'package-doc' },
      },
      markdown: '![original](assets/original.png)\n![pasted](assets/pasted-1.png)',
      assets: { references: ['assets/original.png', 'assets/pasted-1.png'] },
      dirty: { markdown: true, assets: true, presentation: false },
    }

    const saved = await new DocumentService().saveDocument(document)

    expect(saved.ok).toBe(true)
    expect(invoke).toHaveBeenCalledWith('write_mdoc_package', {
      input: expect.objectContaining({
        workspaceRoot: '/tmp/package',
        outputPath: '/docs/report.mdoc',
        entry: 'document.md',
        files: ['assets/original.png', 'assets/pasted-1.png', 'document.md'],
      }),
    })
  })

  it('does not send writer-owned package metadata paths back as user resources', async () => {
    const document: DocumentModel = {
      ...markdownDocument(),
      source: { type: 'package', packagePath: '/docs/report.mdoc', extractedWorkspacePath: '/tmp/package' },
      workspace: {
        id: 'package-workspace',
        rootPath: '/tmp/package',
        entryPath: '/tmp/package/document.md',
        packageEntries: ['README.md', 'manifest.json', 'document.md', 'assets/original.png'],
        packageManifest: { format: 'markdoc-package', version: 1, entry: 'document.md' },
        storage: { type: 'temporary', rootPath: '/tmp/package', recoveryKey: 'package-doc' },
      },
      assets: { references: ['assets/original.png'] },
      dirty: { markdown: true, assets: false, presentation: false },
    }

    const saved = await new DocumentService().saveDocument(document)

    expect(saved.ok).toBe(true)
    expect(invoke).toHaveBeenCalledWith('write_mdoc_package', {
      input: expect.objectContaining({
        files: ['assets/original.png', 'document.md'],
      }),
    })
  })
})
