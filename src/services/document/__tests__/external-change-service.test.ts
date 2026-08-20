import { describe, expect, it } from 'vitest'
import type { DocumentModel } from '../model'
import { createExternalChangeState, documentSourcePath } from '../external-change-service'

function packageDocument(dirty: boolean): DocumentModel {
  return {
    id: 'doc-1',
    source: { type: 'package', packagePath: '/docs/report.mdoc', extractedWorkspacePath: '/tmp/report' },
    workspace: {
      id: 'workspace-1',
      rootPath: '/tmp/report',
      entryPath: '/tmp/report/document.md',
      storage: { type: 'temporary', rootPath: '/tmp/report', recoveryKey: 'doc-1' },
    },
    markdown: '# Report',
    metadata: {},
    assets: { references: [] },
    presentation: {},
    dirty: { markdown: dirty, assets: false, presentation: false },
  }
}

describe('document external change state', () => {
  it('maps a package source to its watched path', () => {
    expect(documentSourcePath(packageDocument(false))).toBe('/docs/report.mdoc')
  })

  it('uses the conflict resolver for dirty document sessions', () => {
    expect(createExternalChangeState(packageDocument(true))).toEqual({
      documentId: 'doc-1',
      path: '/docs/report.mdoc',
      name: 'report.mdoc',
      decision: {
        autoMerge: false,
        actions: ['keepCurrent', 'saveAs', 'discardAndReload'],
      },
    })
  })
})
