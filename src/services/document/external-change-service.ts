import type { DocumentModel } from './model'
import { resolveExternalConflict } from './save-strategy'

export interface DocumentExternalChangeState {
  documentId: string
  path: string
  name: string
  decision: ReturnType<typeof resolveExternalConflict>
}

export function documentSourcePath(document: DocumentModel): string | null {
  if (document.source.type === 'markdown') return document.source.path
  if (document.source.type === 'package') return document.source.packagePath
  if (document.source.type === 'docx') return document.source.originalPath
  if (document.source.type === 'directory') return document.source.entryPath
  return null
}

export function createExternalChangeState(document: DocumentModel): DocumentExternalChangeState | null {
  const path = documentSourcePath(document)
  if (!path) return null
  const sourceType = document.source.type === 'package' || document.source.type === 'markdown'
    ? document.source.type
    : 'directory'
  const dirty = document.dirty.markdown || document.dirty.assets || document.dirty.presentation
  return {
    documentId: document.id,
    path,
    name: path.replace(/\\/g, '/').split('/').pop() || path,
    decision: resolveExternalConflict({ dirty, sourceType }),
  }
}

export { resolveExternalConflict }
