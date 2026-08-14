import { invoke } from '@tauri-apps/api/core'
import { err, ok, type Result } from '../document/errors'
import type { DocumentWorkspace } from '../document/model'

export interface PackageExportOptions {
  outputPath: string
  files: string[]
}

export interface PackageExportResult {
  outputPath: string
  recoveryPath?: string | null
}

export class PackageExporter {
  async export(workspace: DocumentWorkspace, options: PackageExportOptions): Promise<Result<PackageExportResult>> {
    if (!workspace.rootPath) {
      return err('workspace.noRoot', { messageKey: 'errors.workspace.noRoot' })
    }
    try {
      const result = await invoke<PackageExportResult>('write_mdoc_package', {
        input: {
          workspaceRoot: workspace.rootPath,
          outputPath: options.outputPath,
          entry: 'document.md',
          files: options.files,
        },
      })
      return ok(result)
    } catch (cause) {
      return err('save.failed', { messageKey: 'errors.save.failed', cause })
    }
  }
}
