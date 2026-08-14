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
})
