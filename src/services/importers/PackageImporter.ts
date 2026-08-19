import { invoke } from '@tauri-apps/api/core'
import { readTextFile } from '@tauri-apps/plugin-fs'
import { err, ok, type Result } from '../document/errors'
import type { DocumentModel } from '../document/model'
import { createTemporaryWorkspace } from '../document/workspace-service'
import { findLocalAssetReferences } from '../assets/AssetManager'

export interface PackageManifest {
  format: 'markdoc-package'
  version: number
  entry: string
}

export interface PackageInspectResult {
  manifest: PackageManifest
  entries: string[]
  quarantined: string[]
}

interface PackageExtractCommandResult extends PackageInspectResult {
  workspace_root: string
  entry_path: string
}

let documentCounter = 0

function nextDocumentId() {
  documentCounter += 1
  return `package-document-${documentCounter}`
}

export class PackageImporter {
  async inspect(path: string): Promise<Result<PackageInspectResult>> {
    try {
      const result = await invoke<PackageInspectResult>('read_mdoc_package', { packagePath: path })
      if (result.manifest.format !== 'markdoc-package') {
        return err('package.invalidManifest', { messageKey: 'errors.package.invalidManifest', params: { path } })
      }
      return ok(result)
    } catch (cause) {
      return err('package.openFailed', { messageKey: 'errors.package.openFailed', params: { path }, cause })
    }
  }

  async open(path: string, workspaceRoot: string): Promise<Result<DocumentModel>> {
    try {
      const result = await invoke<PackageExtractCommandResult>('extract_mdoc_package', {
        packagePath: path,
        workspaceRoot,
      })
      if (result.manifest.format !== 'markdoc-package') {
        return err('package.invalidManifest', { messageKey: 'errors.package.invalidManifest', params: { path } })
      }
      const markdown = await readTextFile(result.entry_path)
      const id = nextDocumentId()
      const workspace = {
        ...createTemporaryWorkspace(result.workspace_root, `package-import-${id}`),
        entryPath: result.entry_path,
      }
      return ok({
        id,
        source: { type: 'package', packagePath: path, extractedWorkspacePath: result.workspace_root },
        workspace,
        markdown,
        metadata: {},
        assets: { references: findLocalAssetReferences(markdown) },
        presentation: {},
        dirty: { markdown: false, assets: false, presentation: false },
      })
    } catch (cause) {
      return err('package.openFailed', { messageKey: 'errors.package.openFailed', params: { path }, cause })
    }
  }
}
