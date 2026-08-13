import { describe, expect, it } from 'vitest'
import { createMarkdownWorkspace, createTemporaryWorkspace, isRelativeWorkspacePath, resolveWorkspacePath } from '../workspace-service'

describe('WorkspaceService', () => {
  it('creates virtual workspaces for plain markdown without manifest or assets paths', () => {
    const workspace = createMarkdownWorkspace('/docs/report.md')
    expect(workspace.storage.type).toBe('virtual-markdown')
    expect(workspace.entryPath).toBe('/docs/report.md')
    expect(workspace.rootPath).toBe('/docs')
    expect(workspace.manifestPath).toBeUndefined()
    expect(workspace.assetsPath).toBeUndefined()
  })

  it('creates temporary workspaces with recovery keys', () => {
    const workspace = createTemporaryWorkspace('/tmp/markdoc/doc-1', 'docx-import')
    expect(workspace.storage).toEqual({
      type: 'temporary',
      rootPath: '/tmp/markdoc/doc-1',
      recoveryKey: 'docx-import',
    })
    expect(workspace.entryPath).toBe('/tmp/markdoc/doc-1/document.md')
    expect(workspace.assetsPath).toBe('/tmp/markdoc/doc-1/assets')
  })

  it('rejects absolute and traversal workspace-relative paths', () => {
    expect(isRelativeWorkspacePath('assets/a.png')).toBe(true)
    expect(isRelativeWorkspacePath('../secret.txt')).toBe(false)
    expect(isRelativeWorkspacePath('/tmp/secret.txt')).toBe(false)
    expect(isRelativeWorkspacePath('C:\\secret.txt')).toBe(false)
  })

  it('resolves safe relative paths under root', () => {
    const workspace = createTemporaryWorkspace('/tmp/markdoc/doc-1', 'package')
    const result = resolveWorkspacePath(workspace, 'assets/a.png')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe('/tmp/markdoc/doc-1/assets/a.png')
  })
})
