import { readTextFile } from '@tauri-apps/plugin-fs'
import { invoke } from '@tauri-apps/api/core'
import { describe, expect, it, vi } from 'vitest'
import { PackageImporter } from '../PackageImporter'

describe('PackageImporter', () => {
  it('opens an extracted manifest package as a clean package document', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      manifest: { format: 'markdoc-package', version: 1, entry: 'document.md' },
      entries: ['document.md', 'assets/diagram.png'],
      quarantined: ['presentation/style.css'],
      workspace_root: '/tmp/markdoc/package-1',
      entry_path: '/tmp/markdoc/package-1/document.md',
    })
    vi.mocked(readTextFile).mockResolvedValueOnce('# Package')

    const result = await new PackageImporter().open('/docs/report.mdoc', '/tmp/markdoc/package-1')

    expect(result).toMatchObject({
      ok: true,
      value: {
        source: { type: 'package', packagePath: '/docs/report.mdoc', extractedWorkspacePath: '/tmp/markdoc/package-1' },
        workspace: { rootPath: '/tmp/markdoc/package-1', entryPath: '/tmp/markdoc/package-1/document.md' },
        markdown: '# Package',
        dirty: { markdown: false, assets: false, presentation: false },
      },
    })
  })
})
