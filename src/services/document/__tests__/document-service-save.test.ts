import { describe, expect, it } from 'vitest'
import { resolveSaveTarget } from '../save-strategy'
import type { DocumentModel } from '../model'

function doc(source: DocumentModel['source']): DocumentModel {
  return {
    id: 'doc-1',
    source,
    workspace: { id: 'w1', entryPath: 'document.md', storage: { type: 'temporary', rootPath: '/tmp/w1', recoveryKey: 'r1' }, rootPath: '/tmp/w1' },
    markdown: '# x',
    metadata: {},
    assets: { references: [] },
    presentation: {},
    dirty: { markdown: true, assets: false, presentation: false },
  }
}

describe('document save behavior', () => {
  it('docx source primary save resolves to mdoc and never docx overwrite', () => {
    const decision = resolveSaveTarget(doc({ type: 'docx', originalPath: '/docs/a.docx', workspacePath: '/tmp/w1' }))
    expect(decision.defaultKind).toBe('mdoc')
    expect(decision.disallowOverwriteOriginal).toBe(true)
    expect(decision.allowedKinds).not.toContain('docx')
  })

  it('new documents default to mdoc with markdown as alternate', () => {
    const decision = resolveSaveTarget(doc({ type: 'new' }))
    expect(decision.defaultKind).toBe('mdoc')
    expect(decision.allowedKinds).toEqual(['mdoc', 'markdown'])
  })
})
