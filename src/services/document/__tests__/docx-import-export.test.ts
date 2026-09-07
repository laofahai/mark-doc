import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { readTextFile } from '../../native-file'
import { DocxImporter } from '../../importers/DocxImporter'
import { DocxExporter } from '../../exporters/DocxExporter'
import { DocumentService } from '../document-service'

vi.mock('../../native-file', () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}))

describe('DOCX importer/exporter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    [undefined, 'daily', undefined],
    [{ type: 'builtin', id: 'daily' }, 'daily', undefined],
    [{ type: 'builtin', id: 'formal' }, 'formal', undefined],
    [{ type: 'original' }, undefined, '/docs/original.docx'],
    [{ type: 'custom', path: '/docs/custom.docx' }, undefined, '/docs/custom.docx'],
  ] as const)('preserves explicit template choice %j with an original reference present', async (template, builtinTemplate, referenceDocx) => {
    const service = new DocumentService()
    const opened = await service.openMarkdown('/docs/report.md', '# Report')
    if (!opened.ok) throw new Error('fixture failed')
    const page = { size: 'letter', orientation: 'landscape', margins: { top: '1in', right: '2cm', bottom: '18mm', left: '12pt' } } as const
    const document = { ...opened.value.document, presentation: { docx: { referenceDocx: '/docs/original.docx' }, page } }
    vi.mocked(invoke).mockResolvedValueOnce({ output_path: '/docs/output.docx' })
    const result = await service.exportDocx(document, '/docs/output.docx', template)
    expect(result.ok).toBe(true)
    expect(invoke).toHaveBeenCalledWith('export_workspace_to_docx', {
      input: expect.objectContaining({ builtinTemplate, referenceDocx, pageLayout: page }),
    })
  })

  it('rejects unavailable original templates instead of silently using daily', async () => {
    const service = new DocumentService()
    const opened = await service.openMarkdown('/docs/report.md', '# Report')
    if (!opened.ok) throw new Error('fixture failed')
    expect(await service.exportDocx(opened.value.document, '/docs/output.docx', { type: 'original' })).toMatchObject({ ok: false })
    expect(invoke).not.toHaveBeenCalled()
  })

  it.each([
    { type: 'original' },
    { type: 'custom', path: '/docs/custom.docx' },
    { type: 'builtin', id: 'formal' },
  ] as const)('preserves template page geometry without explicit document settings: %j', async template => {
    const service = new DocumentService()
    const opened = await service.openMarkdown('/docs/report.md', '# Report')
    if (!opened.ok) throw new Error('fixture failed')
    const document = { ...opened.value.document, presentation: { docx: { referenceDocx: '/docs/original.docx' } } }
    vi.mocked(invoke).mockResolvedValueOnce({ output_path: '/docs/output.docx' })
    expect(await service.exportDocx(document, '/docs/output.docx', template)).toMatchObject({ ok: true })
    expect(invoke).toHaveBeenCalledWith('export_workspace_to_docx', { input: expect.objectContaining({ pageLayout: undefined }) })
  })

  it('passes explicit builtin and page parameters through the exporter', async () => {
    const pageLayout = { size: 'letter', orientation: 'landscape', margins: { top: '1in', right: '1in', bottom: '1in', left: '1in' } } as const
    vi.mocked(invoke).mockResolvedValueOnce({ output_path: '/docs/report.docx' })
    const input = { markdownPath: '/tmp/document.md', outputPath: '/docs/report.docx', builtinTemplate: 'formal', pageLayout } as const
    expect(await new DocxExporter().export(input)).toMatchObject({ ok: true })
    expect(invoke).toHaveBeenCalledWith('export_workspace_to_docx', { input: { ...input, referenceDocx: undefined } })
  })

  it('uses the workspace paths returned by the docx import command', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      workspace_root: '/tmp/markdoc/doc-1',
      markdown_path: '/tmp/markdoc/doc-1/converted/content.md',
      assets_path: '/tmp/markdoc/doc-1/media/extracted',
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

  it('loads markdown from the extracted DOCX workspace entry', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      workspace_root: '/tmp/markdoc/doc-2',
      markdown_path: '/tmp/markdoc/doc-2/document.md',
      assets_path: '/tmp/markdoc/doc-2/assets',
    })
    vi.mocked(readTextFile).mockResolvedValueOnce('# Imported DOCX')

    const result = await new DocxImporter().import('/docs/report.docx', '/tmp/markdoc/doc-2')

    expect(result).toMatchObject({ ok: true, value: { markdown: '# Imported DOCX' } })
  })

  it('registers local assets referenced by imported DOCX markdown', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      workspace_root: '/tmp/markdoc/doc-assets',
      markdown_path: '/tmp/markdoc/doc-assets/document.md',
      assets_path: '/tmp/markdoc/doc-assets/assets',
    })
    vi.mocked(readTextFile).mockResolvedValueOnce([
      '![diagram](assets/diagram.png)',
      '<img src="assets/photo.jpg">',
      '![remote](https://example.com/remote.png)',
    ].join('\n'))

    const result = await new DocxImporter().import('/docs/report.docx', '/tmp/markdoc/doc-assets')

    expect(result).toMatchObject({
      ok: true,
      value: { assets: { references: ['assets/diagram.png', 'assets/photo.jpg'] } },
    })
  })

  it('returns the docx import error contract when the command rejects', async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error('import failed'))
    const result = await new DocxImporter().import('/docs/report.docx', '/tmp/markdoc/doc-1')
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'import.docxFailed', messageKey: 'errors.import.docxFailed' },
    })
  })

  it('opens legacy .doc files through the Word import flow', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      workspace_root: '/tmp/markdoc/doc-legacy',
      markdown_path: '/tmp/markdoc/doc-legacy/document.md',
      assets_path: '/tmp/markdoc/doc-legacy/assets',
    })
    vi.mocked(readTextFile).mockResolvedValueOnce('# Imported DOC')

    const result = await new DocumentService().openPath('/docs/report.doc')

    expect(result.ok).toBe(true)
    expect(invoke).toHaveBeenCalledWith('import_docx_to_workspace', {
      inputPath: '/docs/report.doc',
      workspaceRoot: expect.stringContaining('/tmp/markdoc/docx-'),
    })
    if (result.ok) {
      expect(result.value.document.source).toMatchObject({
        type: 'docx',
        originalPath: '/docs/report.doc',
      })
      expect(result.value.document.markdown).toBe('# Imported DOC')
    }
  })

  it('exports document workspace through docx command', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ output_path: '/docs/report.docx' })
    const exporter = new DocxExporter()
    const result = await exporter.export({
      markdownPath: '/tmp/doc/document.md',
      outputPath: '/docs/report.docx',
      referenceDocx: '/tmp/doc/presentation/reference.docx',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.outputPath).toBe('/docs/report.docx')
    }
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
