import { describe, expect, it } from 'vitest'
import type { DocumentModel } from '../model'
import { DocumentSessionStore } from '../session-store'
import { RecoveryService } from '../recovery-service'
import { resolveExternalConflict, resolveSaveTarget } from '../save-strategy'

function model(source: DocumentModel['source']): DocumentModel {
  return {
    id: 'doc-1',
    source,
    workspace: {
      id: 'workspace-1',
      rootPath: '/tmp/doc-1',
      entryPath: '/tmp/doc-1/document.md',
      storage: { type: 'temporary', rootPath: '/tmp/doc-1', recoveryKey: 'test' },
    },
    markdown: '# Hello',
    metadata: {},
    assets: { references: [] },
    presentation: {},
    dirty: { markdown: false, assets: false, presentation: false },
  }
}

describe('document session and save strategy', () => {
  it('defaults new documents to mdoc while allowing markdown', () => {
    expect(resolveSaveTarget(model({ type: 'new' }))).toEqual({
      defaultKind: 'mdoc',
      allowedKinds: ['mdoc', 'markdown'],
      requiresDialog: true,
    })
  })

  it('does not overwrite imported docx on primary save', () => {
    expect(resolveSaveTarget(model({ type: 'docx', originalPath: '/docs/a.docx', workspacePath: '/tmp/doc' }))).toMatchObject({
      defaultKind: 'mdoc',
      disallowOverwriteOriginal: true,
    })
  })

  it('keeps markdown in-place unless newly imported assets require save as', () => {
    expect(resolveSaveTarget(model({ type: 'markdown', path: '/docs/a.md' }))).toMatchObject({
      defaultKind: 'markdown',
      requiresDialog: false,
    })
    const withAssets = model({ type: 'markdown', path: '/docs/a.md' })
    withAssets.dirty.assets = true
    expect(resolveSaveTarget(withAssets)).toMatchObject({
      defaultKind: 'mdoc',
      requiresDialog: true,
    })
  })

  it('keeps dirty mdoc external conflicts out of automatic merge', () => {
    expect(resolveExternalConflict({ dirty: true, sourceType: 'package' })).toEqual({
      autoMerge: false,
      actions: ['keepCurrent', 'saveAs', 'discardAndReload'],
    })
  })

  it('records recovery states that preserve content before hiding failures', () => {
    const recovery = new RecoveryService()
    const state = recovery.recordSaveFailure('doc-1', {
      draftPath: '/tmp/recovery/doc-1/document.md',
      markdown: '# Preserved draft',
      originalUnchanged: true,
      reason: 'cloud-lock',
    })
    expect(state.priority).toEqual(['content-preserved', 'original-unchanged', 'user-visible'])
    expect(recovery.get('doc-1')?.markdown).toBe('# Preserved draft')
  })

  it('stores sessions by document id', () => {
    const store = new DocumentSessionStore()
    store.add(model({ type: 'new' }))
    expect(store.get('doc-1')?.document.markdown).toBe('# Hello')
  })
})
