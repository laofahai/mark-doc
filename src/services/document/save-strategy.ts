import type { DocumentModel } from './model'
import { containsBase64Images } from '../assets/AssetManager'

export type SaveKind = 'mdoc' | 'markdown' | 'docx'

export interface SaveTargetDecision {
  defaultKind: SaveKind
  allowedKinds: SaveKind[]
  requiresDialog: boolean
  disallowOverwriteOriginal?: boolean
}

function needsPackageSave(document: DocumentModel) {
  return document.dirty.assets
    || document.dirty.presentation
    || containsBase64Images(document.markdown)
}

export function resolveSaveTarget(document: DocumentModel): SaveTargetDecision {
  if (document.source.type === 'new') {
    return { defaultKind: 'mdoc', allowedKinds: ['mdoc', 'markdown'], requiresDialog: true }
  }
  if (document.source.type === 'docx') {
    return {
      defaultKind: 'mdoc',
      allowedKinds: ['mdoc', 'markdown'],
      requiresDialog: true,
      disallowOverwriteOriginal: true,
    }
  }
  if (document.source.type === 'markdown') {
    return needsPackageSave(document)
      ? { defaultKind: 'mdoc', allowedKinds: ['mdoc', 'markdown'], requiresDialog: true }
      : { defaultKind: 'markdown', allowedKinds: ['markdown', 'mdoc'], requiresDialog: false }
  }
  if (document.source.type === 'package') {
    return { defaultKind: 'mdoc', allowedKinds: ['mdoc'], requiresDialog: false }
  }
  return { defaultKind: 'mdoc', allowedKinds: ['mdoc', 'markdown'], requiresDialog: true }
}

export function resolveExternalConflict(input: { dirty: boolean; sourceType: 'package' | 'markdown' | 'directory' }) {
  if (input.dirty) {
    return {
      autoMerge: false,
      actions: ['keepCurrent', 'saveAs', 'discardAndReload'] as const,
    }
  }
  return {
    autoMerge: false,
    actions: ['reload'] as const,
  }
}
