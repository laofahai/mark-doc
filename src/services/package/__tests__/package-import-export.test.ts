import { describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { PackageImporter } from '../../importers/PackageImporter'
import { PackageExporter } from '../../exporters/PackageExporter'
import { createTemporaryWorkspace } from '../../document/workspace-service'

describe('package import/export wrappers', () => {
  it('imports only manifest-identified mdoc packages', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      manifest: { format: 'markdoc-package', version: 1, entry: 'document.md' },
      entries: ['document.md', 'assets/a.png'],
      quarantined: ['presentation/print.css'],
    })
    const importer = new PackageImporter()
    const result = await importer.inspect('/docs/report.mdoc')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.manifest.entry).toBe('document.md')
      expect(result.value.quarantined).toEqual(['presentation/print.css'])
    }
  })

  it('exports workspace through write_mdoc_package command', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ outputPath: '/docs/report.mdoc', recoveryPath: null })
    const exporter = new PackageExporter()
    const workspace = createTemporaryWorkspace('/tmp/markdoc/doc-1', 'test')
    const result = await exporter.export(workspace, {
      outputPath: '/docs/report.mdoc',
      entry: 'document.md',
      files: ['document.md', 'assets/a.png'],
    })
    expect(result.ok).toBe(true)
    expect(invoke).toHaveBeenCalledWith('write_mdoc_package', {
      input: {
        workspaceRoot: '/tmp/markdoc/doc-1',
        outputPath: '/docs/report.mdoc',
        entry: 'document.md',
        files: ['document.md', 'assets/a.png'],
      },
    })
  })

  it('validates packages through validate_mdoc_package command', async () => {
    vi.clearAllMocks()
    vi.mocked(invoke).mockResolvedValueOnce({
      manifest: { format: 'markdoc-package', version: 1, entry: 'document.md' },
      entries: ['document.md'],
      quarantined: ['assets/icon.svg'],
      has_readme_hint: false,
      warnings: ['package.missingReadmeHint', 'package.quarantinedEntries'],
    })
    const importer = new PackageImporter()

    const result = await importer.validate('/docs/legacy.mdoc')

    expect(result.ok).toBe(true)
    expect(invoke).toHaveBeenCalledWith('validate_mdoc_package', { packagePath: '/docs/legacy.mdoc' })
    if (result.ok) {
      expect(result.value.warnings).toEqual(['package.missingReadmeHint', 'package.quarantinedEntries'])
      expect(result.value.has_readme_hint).toBe(false)
    }
  })

  it('preserves the manifest entry and safe workspace file list when repacking', async () => {
    vi.clearAllMocks()
    vi.mocked(invoke).mockResolvedValueOnce({ outputPath: '/docs/report.mdoc', recoveryPath: null })
    const exporter = new PackageExporter()
    const workspace = createTemporaryWorkspace('/tmp/markdoc/doc-2', 'test')
    const manifest = { format: 'markdoc-package', version: 1, entry: 'content/main.md' }

    await exporter.export(workspace, {
      outputPath: '/docs/report.mdoc',
      entry: 'content/main.md',
      files: ['content/main.md', 'assets/chart.png', 'presentation/reference.docx'],
      manifest,
    })

    expect(invoke).toHaveBeenCalledWith('write_mdoc_package', {
      input: {
        workspaceRoot: '/tmp/markdoc/doc-2',
        outputPath: '/docs/report.mdoc',
        entry: 'content/main.md',
        files: ['content/main.md', 'assets/chart.png', 'presentation/reference.docx'],
        manifest,
      },
    })
  })

  it('returns the openFailed message key when package inspection fails', async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error('read failed'))
    const importer = new PackageImporter()
    const result = await importer.inspect('/docs/report.mdoc')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('package.openFailed')
      expect(result.error.messageKey).toBe('errors.package.openFailed')
    }
  })
})
