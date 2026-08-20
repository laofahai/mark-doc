import { describe, expect, it } from 'vitest'
import { containsBase64Images } from '../../assets/AssetManager'
import type { DocumentModel } from '../model'
import { resolveSaveTarget } from '../save-strategy'

function model(source: DocumentModel['source'], markdown = '# Hello'): DocumentModel {
  return {
    id: 'doc-1',
    source,
    workspace: {
      id: 'w1',
      rootPath: '/tmp/w1',
      entryPath: '/tmp/w1/document.md',
      storage: { type: 'temporary', rootPath: '/tmp/w1', recoveryKey: 'r1' },
    },
    markdown,
    metadata: {},
    assets: { references: [] },
    presentation: {},
    dirty: { markdown: false, assets: false, presentation: false },
  }
}

describe('document architecture acceptance', () => {
  it('keeps plain markdown as in-place save by default', () => {
    expect(resolveSaveTarget(model({ type: 'markdown', path: '/docs/readme.md' })).defaultKind).toBe('markdown')
  })

  it('saves imported docx as canonical mdoc, not docx', () => {
    const decision = resolveSaveTarget(model({ type: 'docx', originalPath: '/docs/a.docx', workspacePath: '/tmp/w1' }))
    expect(decision.defaultKind).toBe('mdoc')
    expect(decision.allowedKinds).not.toContain('docx')
  })

  it('rejects default base64 source quality', () => {
    expect(containsBase64Images('![x](data:image/png;base64,AAAA)')).toBe(true)
    expect(containsBase64Images('![x](assets/x.png)')).toBe(false)
  })

})
