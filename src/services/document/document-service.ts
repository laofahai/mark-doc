import { ok, type Result } from './errors'
import type { DocumentSession } from './session-store'
import { DocumentSessionStore } from './session-store'
import { MarkdownImporter } from '../importers/MarkdownImporter'

export interface OpenDocumentResult extends DocumentSession {
  resourceSuggestion?: {
    kind: 'suggest-mdoc'
    references: string[]
  }
}

export class DocumentService {
  private sessions = new DocumentSessionStore()
  private markdownImporter = new MarkdownImporter()

  async openMarkdown(path: string, markdown: string): Promise<Result<OpenDocumentResult>> {
    const imported = this.markdownImporter.import(path, markdown)
    if (!imported.ok) return imported

    this.sessions.add(imported.value.document)
    const session = this.sessions.get(imported.value.document.id)!
    return ok({
      ...session,
      resourceSuggestion: imported.value.localResourceReferences.length > 0
        ? { kind: 'suggest-mdoc', references: imported.value.localResourceReferences }
        : undefined,
    })
  }
}
