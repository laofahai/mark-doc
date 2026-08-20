import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import { copyFile, mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentService } from '../document-service'
import type { DocumentModel } from '../model'

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

describe('DocumentService package saves', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(save).mockResolvedValue('/exports/report.mdoc')
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
    expect(mkdir).toHaveBeenCalledWith(input.workspaceRoot, { recursive: true })
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
})
