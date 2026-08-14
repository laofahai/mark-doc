import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { DocxImporter } from '../../importers/DocxImporter'
import { DocxExporter } from '../../exporters/DocxExporter'

describe('DOCX importer/exporter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the workspace paths returned by the docx import command', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      workspaceRoot: '/tmp/markdoc/doc-1',
      markdownPath: '/tmp/markdoc/doc-1/converted/content.md',
      assetsPath: '/tmp/markdoc/doc-1/media/extracted',
    })
    const importer = new DocxImporter()
    const result = await importer.import('/docs/report.docx', '/tmp/markdoc/doc-1')
    expect(result.ok).toBe(true)
    expect(invoke).toHaveBeenCalledWith('import_docx_to_workspace', {
      inputPath: '/docs/report.docx',
      workspaceRoot: '/tmp/markdoc/doc-1',
    })
    if (result.ok) {
      expect(result.value.source).toEqual({
        type: 'docx',
        originalPath: '/docs/report.docx',
        workspacePath: '/tmp/markdoc/doc-1',
      })
      expect(result.value.workspace.entryPath).toBe('/tmp/markdoc/doc-1/converted/content.md')
      expect(result.value.workspace.assetsPath).toBe('/tmp/markdoc/doc-1/media/extracted')
    }
  })

  it('returns the docx import error contract when the command rejects', async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error('import failed'))
    const result = await new DocxImporter().import('/docs/report.docx', '/tmp/markdoc/doc-1')
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'import.docxFailed', messageKey: 'errors.import.docxFailed' },
    })
  })

  it('exports document workspace through docx command', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ outputPath: '/docs/report.docx' })
    const exporter = new DocxExporter()
    const result = await exporter.export({
      markdownPath: '/tmp/doc/document.md',
      outputPath: '/docs/report.docx',
      referenceDocx: '/tmp/doc/presentation/reference.docx',
    })
    expect(result.ok).toBe(true)
    expect(invoke).toHaveBeenCalledWith('export_workspace_to_docx', {
      input: {
        markdownPath: '/tmp/doc/document.md',
        outputPath: '/docs/report.docx',
        referenceDocx: '/tmp/doc/presentation/reference.docx',
      },
    })
  })

  it('returns the docx export error contract when the command rejects', async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error('export failed'))
    const result = await new DocxExporter().export({
      markdownPath: '/tmp/doc/document.md',
      outputPath: '/docs/report.docx',
    })
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'export.docxFailed', messageKey: 'errors.export.docxFailed' },
    })
  })
})
