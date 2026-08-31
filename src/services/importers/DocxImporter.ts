import { invoke } from '@tauri-apps/api/core'
import { err, ok, type Result } from '../document/errors'
import type { DocumentModel } from '../document/model'
import { createTemporaryWorkspace } from '../document/workspace-service'
import { findLocalAssetReferences } from '../assets/AssetManager'
import { readTextFile } from '../native-file'

let documentCounter = 0

function nextDocumentId() {
  documentCounter += 1
  return `docx-document-${documentCounter}`
}

interface DocxImportCommandResult {
  workspace_root: string
  markdown_path: string
  assets_path: string
}

function createImportedWorkspace(result: DocxImportCommandResult) {
  return {
    ...createTemporaryWorkspace(result.workspace_root, 'docx-import'),
    entryPath: result.markdown_path,
    assetsPath: result.assets_path,
  }
}

export class DocxImporter {
  async import(inputPath: string, workspaceRoot: string): Promise<Result<DocumentModel>> {
    try {
      const result = await invoke<DocxImportCommandResult>('import_docx_to_workspace', {
        inputPath,
        workspaceRoot,
      })
      const workspace = createImportedWorkspace(result)
      const markdown = await readTextFile(result.markdown_path)
      return ok({
        id: nextDocumentId(),
        source: { type: 'docx', originalPath: inputPath, workspacePath: result.workspace_root },
        workspace,
        markdown,
        metadata: {},
        assets: { references: findLocalAssetReferences(markdown) },
        presentation: { docx: { referenceDocx: inputPath } },
        dirty: { markdown: false, assets: false, presentation: false },
      })
    } catch (cause) {
      return err('import.docxFailed', { messageKey: 'errors.import.docxFailed', cause })
    }
  }
}
