import { mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { describe, expect, it, vi } from 'vitest'
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

  it('persists and restores recovery content from a dedicated draft', async () => {
    const recovery = new RecoveryService()
    const state = await recovery.persistSaveFailure('doc-1', {
      markdown: '# Preserved draft',
      originalUnchanged: true,
      reason: 'cloud-lock',
    })

    expect(state.draftPath).toBe('/tmp/markdoc/recovery/doc-1.md')
    expect(mkdir).toHaveBeenCalledWith('/tmp/markdoc/recovery', { recursive: true })
    expect(writeTextFile).toHaveBeenCalledWith(state.draftPath, '# Preserved draft')
    vi.mocked(readTextFile).mockResolvedValueOnce('# Draft from disk')
    expect(state.priority).toEqual(['content-preserved', 'original-unchanged', 'user-visible'])
    await expect(recovery.restoreDraft('doc-1')).resolves.toBe('# Draft from disk')
  })

  it('stores sessions by document id', () => {
    const store = new DocumentSessionStore()
    store.add(model({ type: 'new' }))
    expect(store.get('doc-1')?.document.markdown).toBe('# Hello')
  })

  it('initializes dirty documents with a dirty save state', () => {
    const store = new DocumentSessionStore()
    const dirty = model({ type: 'new' })
    dirty.dirty.assets = true

    store.add(dirty)

    expect(store.get('doc-1')?.saveState).toBe('dirty')
  })
})
