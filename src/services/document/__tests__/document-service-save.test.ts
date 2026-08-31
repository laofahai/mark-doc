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

  it('new documents default to mdoc and allow markdown as an alternate', () => {
    const decision = resolveSaveTarget(doc({ type: 'new' }))
    expect(decision.defaultKind).toBe('mdoc')
    expect(decision.allowedKinds).toEqual(['mdoc', 'markdown'])
    expect(decision.requiresDialog).toBe(true)
  })

  it('new documents with package-only resources prompt for mdoc', () => {
    const decision = resolveSaveTarget({
      ...doc({ type: 'new' }),
      assets: { references: ['assets/screenshot.png'] },
      dirty: { markdown: true, assets: true, presentation: false },
    })

    expect(decision).toEqual({
      defaultKind: 'mdoc',
      allowedKinds: ['mdoc', 'markdown'],
      requiresDialog: true,
    })
  })

  it('plain markdown with existing local resource references keeps in-place markdown save', () => {
    const decision = resolveSaveTarget({
      ...doc({ type: 'markdown', path: '/docs/report.md' }),
      assets: { references: ['assets/diagram.png'] },
      dirty: { markdown: true, assets: false, presentation: false },
    })

    expect(decision).toEqual({
      defaultKind: 'markdown',
      allowedKinds: ['markdown', 'mdoc'],
      requiresDialog: false,
    })
  })

  it('plain markdown with newly imported assets prompts to save as mdoc on normal save', () => {
    const decision = resolveSaveTarget({
      ...doc({ type: 'markdown', path: '/docs/report.md' }),
      assets: { references: ['assets/pasted.png'] },
      dirty: { markdown: true, assets: true, presentation: false },
    })

    expect(decision).toEqual({
      defaultKind: 'mdoc',
      allowedKinds: ['mdoc', 'markdown'],
      requiresDialog: true,
    })
  })

  it('plain markdown with inline base64 images prompts to save as mdoc on normal save', () => {
    const decision = resolveSaveTarget({
      ...doc({ type: 'markdown', path: '/docs/report.md' }),
      markdown: '![screenshot](data:image/png;base64,AQID)',
      dirty: { markdown: true, assets: false, presentation: false },
    })

    expect(decision).toEqual({
      defaultKind: 'mdoc',
      allowedKinds: ['mdoc', 'markdown'],
      requiresDialog: true,
    })
  })
})
