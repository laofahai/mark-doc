import { describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { DocxImporter } from '../../importers/DocxImporter'
import { DocxExporter } from '../../exporters/DocxExporter'

describe('DOCX importer/exporter', () => {
  it('imports docx as workspace source without base64 markdown', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      workspaceRoot: '/tmp/markdoc/doc-1',
      markdownPath: '/tmp/markdoc/doc-1/document.md',
      assetsPath: '/tmp/markdoc/doc-1/assets',
    })
    const importer = new DocxImporter()
    const result = await importer.import('/docs/report.docx', '/tmp/markdoc/doc-1')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.source).toEqual({
        type: 'docx',
        originalPath: '/docs/report.docx',
        workspacePath: '/tmp/markdoc/doc-1',
      })
      expect(result.value.workspace.entryPath).toBe('/tmp/markdoc/doc-1/document.md')
    }
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
})
