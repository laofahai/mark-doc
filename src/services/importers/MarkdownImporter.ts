import { ok, type Result } from '../document/errors'
import type { DocumentModel } from '../document/model'
import { createMarkdownWorkspace } from '../document/workspace-service'
import { findLocalAssetReferences } from '../assets/AssetManager'

let documentCounter = 0

function nextDocumentId() {
  documentCounter += 1
  return `document-${documentCounter}`
}

export interface MarkdownImportResult {
  document: DocumentModel
  localResourceReferences: string[]
}

export class MarkdownImporter {
  import(path: string, markdown: string): Result<MarkdownImportResult> {
    const workspace = createMarkdownWorkspace(path)
    const references = findLocalAssetReferences(markdown)
    return ok({
      document: {
        id: nextDocumentId(),
        source: { type: 'markdown', path },
        workspace,
        markdown,
        metadata: {},
        assets: { references },
        presentation: {},
        dirty: { markdown: false, assets: false, presentation: false },
      },
      localResourceReferences: references,
    })
  }
}
