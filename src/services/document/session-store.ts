import type { DocumentModel } from './model'

export interface DocumentSession {
  document: DocumentModel
  saveState: 'clean' | 'dirty' | 'saving' | 'recovery'
  externalState: 'current' | 'modified-externally'
}

export class DocumentSessionStore {
  private sessions = new Map<string, DocumentSession>()

  add(document: DocumentModel) {
    const dirty = document.dirty.markdown || document.dirty.assets || document.dirty.presentation
    this.sessions.set(document.id, {
      document,
      saveState: dirty ? 'dirty' : 'clean',
      externalState: 'current',
    })
  }

  get(documentId: string) {
    return this.sessions.get(documentId)
  }

  update(documentId: string, update: Partial<DocumentSession>) {
    const current = this.sessions.get(documentId)
    if (!current) return
    this.sessions.set(documentId, { ...current, ...update })
  }

  all() {
    return [...this.sessions.values()]
  }
}
