import { invoke } from '@tauri-apps/api/core'
import { err, ok, type Result } from '../document/errors'
import type { DocumentModel } from '../document/model'
import { createTemporaryWorkspace, resolveWorkspacePath } from '../document/workspace-service'
import { findLocalAssetReferences } from '../assets/AssetManager'
import { readTextFile } from '../native-file'

export interface PackageManifest {
  format: 'markdoc-package'
  version: number
  entry: string
  schema?: string
  spec?: string
  createdBy?: { name: string; [key: string]: unknown }
  presentation?: { print?: string; docxReference?: string; [key: string]: unknown }
  [key: string]: unknown
}

export interface PackageInspectResult {
  manifest: PackageManifest
  entries: string[]
  quarantined: string[]
  has_readme_hint?: boolean
}

export interface PackageValidationResult extends PackageInspectResult {
  warnings: string[]
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

  async validate(path: string): Promise<Result<PackageValidationResult>> {
    try {
      const result = await invoke<PackageValidationResult>('validate_mdoc_package', { packagePath: path })
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
      const extracted = await this.extractOrRecover(path, workspaceRoot)
      const result = extracted.result
      if (result.manifest.format !== 'markdoc-package') {
        return err('package.invalidManifest', { messageKey: 'errors.package.invalidManifest', params: { path } })
      }
      const markdown = await readTextFile(result.entry_path)
      const id = nextDocumentId()
      const workspace = {
        ...createTemporaryWorkspace(result.workspace_root, `package-import-${id}`),
        entryPath: result.entry_path,
        packageEntries: result.entries,
        packageManifest: result.manifest,
        packageQuarantined: result.quarantined,
        packageRecovered: extracted.recovered,
      }
      const referenceDocx = this.extractedDocxReference(result, workspace)
      return ok({
        id,
        source: { type: 'package', packagePath: path, extractedWorkspacePath: result.workspace_root },
        workspace,
        markdown,
        metadata: {},
        assets: { references: findLocalAssetReferences(markdown) },
        presentation: referenceDocx
          ? { docx: { referenceDocx } }
          : {},
        dirty: { markdown: false, assets: false, presentation: false },
      })
    } catch (cause) {
      return err('package.openFailed', { messageKey: 'errors.package.openFailed', params: { path }, cause })
    }
  }

  private async extractOrRecover(path: string, workspaceRoot: string) {
    try {
      const result = await invoke<PackageExtractCommandResult>('extract_mdoc_package', {
        packagePath: path,
        workspaceRoot,
      })
      return { result, recovered: false }
    } catch (extractCause) {
      try {
        const result = await invoke<PackageExtractCommandResult>('recover_mdoc_package', {
          packagePath: path,
          workspaceRoot,
        })
        return { result, recovered: true }
      } catch (recoveryCause) {
        throw { extractCause, recoveryCause }
      }
    }
  }

  private extractedDocxReference(result: PackageExtractCommandResult, workspace: DocumentModel['workspace']) {
    const reference = result.manifest.presentation?.docxReference
    if (!reference || !result.entries.includes(reference)) return undefined
    const resolved = resolveWorkspacePath(workspace, reference)
    return resolved.ok ? resolved.value : undefined
  }
}
