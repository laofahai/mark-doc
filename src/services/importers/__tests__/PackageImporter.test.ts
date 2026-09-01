import { invoke } from '@tauri-apps/api/core'
import { describe, expect, it, vi } from 'vitest'
import { PackageImporter } from '../PackageImporter'
import { readTextFile } from '../../native-file'

vi.mock('../../native-file', () => ({
  readTextFile: vi.fn(),
}))

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
        workspace: {
          rootPath: '/tmp/markdoc/package-1',
          entryPath: '/tmp/markdoc/package-1/document.md',
          packageQuarantined: ['presentation/style.css'],
        },
        markdown: '# Package',
        dirty: { markdown: false, assets: false, presentation: false },
      },
    })
  })

  it('resolves an extracted manifest docx reference to the workspace file path', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      manifest: {
        format: 'markdoc-package',
        version: 1,
        entry: 'document.md',
        presentation: { docxReference: 'presentation/reference.docx' },
      },
      entries: ['document.md', 'presentation/reference.docx'],
      quarantined: [],
      workspace_root: '/tmp/markdoc/package-2',
      entry_path: '/tmp/markdoc/package-2/document.md',
    })
    vi.mocked(readTextFile).mockResolvedValueOnce('# Package')

    const result = await new PackageImporter().open('/docs/report.mdoc', '/tmp/markdoc/package-2')

    expect(result).toMatchObject({
      ok: true,
      value: {
        presentation: {
          docx: { referenceDocx: '/tmp/markdoc/package-2/presentation/reference.docx' },
        },
      },
    })
  })

  it('does not expose a manifest docx reference that was not extracted', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      manifest: {
        format: 'markdoc-package',
        version: 1,
        entry: 'document.md',
        presentation: { docxReference: 'presentation/reference.docx' },
      },
      entries: ['document.md'],
      missing_resources: ['presentation/reference.docx'],
      quarantined: ['presentation/reference.docx'],
      workspace_root: '/tmp/markdoc/package-3',
      entry_path: '/tmp/markdoc/package-3/document.md',
    })
    vi.mocked(readTextFile).mockResolvedValueOnce('# Package')

    const result = await new PackageImporter().open('/docs/report.mdoc', '/tmp/markdoc/package-3')

    expect(result).toMatchObject({
      ok: true,
      value: { presentation: {} },
    })
  })

  it('keeps missing manifest resources separate from quarantined resources', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      manifest: {
        format: 'markdoc-package',
        version: 1,
        entry: 'document.md',
        presentation: {
          print: 'presentation/print.css',
          docxReference: 'presentation/reference.docx',
        },
      },
      entries: ['document.md'],
      missing_resources: ['presentation/print.css', 'presentation/reference.docx'],
      quarantined: [],
      workspace_root: '/tmp/markdoc/package-4',
      entry_path: '/tmp/markdoc/package-4/document.md',
    })
    vi.mocked(readTextFile).mockResolvedValueOnce('# Package')

    const result = await new PackageImporter().open('/docs/report.mdoc', '/tmp/markdoc/package-4')

    expect(result).toMatchObject({
      ok: true,
      value: {
        workspace: {
          packageMissingManifestResources: ['presentation/print.css', 'presentation/reference.docx'],
          packageQuarantined: [],
        },
        presentation: {},
      },
    })
  })

  it('falls back to safe package recovery when normal extraction fails', async () => {
    vi.clearAllMocks()
    vi.mocked(invoke)
      .mockRejectedValueOnce('package.invalidManifest')
      .mockResolvedValueOnce({
        manifest: { format: 'markdoc-package', version: 1, entry: 'document.md' },
        entries: ['document.md', 'assets/image.png'],
        quarantined: ['presentation/print.css'],
        has_readme_hint: true,
        workspace_root: '/tmp/markdoc/recovered-package',
        entry_path: '/tmp/markdoc/recovered-package/document.md',
      })
    vi.mocked(readTextFile).mockResolvedValueOnce('# Recovered')

    const result = await new PackageImporter().open('/docs/broken.mdoc', '/tmp/markdoc/recovered-package')

    expect(result).toMatchObject({
      ok: true,
      value: {
        markdown: '# Recovered',
        workspace: {
          packageEntries: ['document.md', 'assets/image.png'],
          packageQuarantined: ['presentation/print.css'],
          packageRecovered: true,
        },
      },
    })
    expect(invoke).toHaveBeenNthCalledWith(1, 'extract_mdoc_package', {
      packagePath: '/docs/broken.mdoc',
      workspaceRoot: '/tmp/markdoc/recovered-package',
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'recover_mdoc_package', {
      packagePath: '/docs/broken.mdoc',
      workspaceRoot: '/tmp/markdoc/recovered-package',
    })
  })
})
