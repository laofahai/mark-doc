import { invoke } from '@tauri-apps/api/core'
import { err, ok, type Result } from '../document/errors'
import type { DocumentModel } from '../document/model'
import { createTemporaryWorkspace } from '../document/workspace-service'

let documentCounter = 0

function nextDocumentId() {
  documentCounter += 1
  return `docx-document-${documentCounter}`
}

interface DocxImportCommandResult {
  workspaceRoot: string
  markdownPath: string
  assetsPath: string
}

export class DocxImporter {
  async import(inputPath: string, workspaceRoot: string): Promise<Result<DocumentModel>> {
    try {
      const result = await invoke<DocxImportCommandResult>('import_docx_to_workspace', {
        inputPath,
        workspaceRoot,
      })
      const workspace = createTemporaryWorkspace(result.workspaceRoot, 'docx-import')
      return ok({
        id: nextDocumentId(),
        source: { type: 'docx', originalPath: inputPath, workspacePath: result.workspaceRoot },
        workspace,
        markdown: '',
        metadata: {},
        assets: { references: [] },
        presentation: { docx: { referenceDocx: inputPath } },
        dirty: { markdown: false, assets: false, presentation: false },
      })
    } catch (cause) {
      return err('import.docxFailed', { messageKey: 'errors.import.docxFailed', cause })
    }
  }
}
