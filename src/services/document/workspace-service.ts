import { err, ok, type Result } from './errors'
import type { DocumentWorkspace } from './model'

let workspaceCounter = 0

function nextWorkspaceId() {
  workspaceCounter += 1
  return `workspace-${workspaceCounter}`
}

function parentDir(path: string) {
  const normalized = path.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')
  return index >= 0 ? normalized.slice(0, index) || '/' : ''
}

function joinPath(...parts: string[]) {
  return parts
    .join('/')
    .replace(/\/+/g, '/')
    .replace(/^([A-Za-z]):\//, '$1:/')
}

export function isRelativeWorkspacePath(path: string) {
  const normalized = path.replace(/\\/g, '/')
  return Boolean(normalized)
    && !normalized.startsWith('/')
    && !/^[A-Za-z]:\//.test(normalized)
    && !normalized.split('/').includes('..')
}

export function createMarkdownWorkspace(markdownPath: string): DocumentWorkspace {
  return {
    id: nextWorkspaceId(),
    rootPath: parentDir(markdownPath),
    entryPath: markdownPath,
    storage: { type: 'virtual-markdown', markdownPath },
  }
}

export function createTemporaryWorkspace(rootPath: string, recoveryKey: string): DocumentWorkspace {
  return {
    id: nextWorkspaceId(),
    rootPath,
    entryPath: joinPath(rootPath, 'document.md'),
    assetsPath: joinPath(rootPath, 'assets'),
    presentationPath: joinPath(rootPath, 'presentation'),
    manifestPath: joinPath(rootPath, 'manifest.json'),
    storage: { type: 'temporary', rootPath, recoveryKey },
  }
}

export function resolveWorkspacePath(workspace: DocumentWorkspace, relativePath: string): Result<string> {
  if (!workspace.rootPath) {
    return err('workspace.noRoot', { messageKey: 'errors.workspace.noRoot' })
  }
  if (!isRelativeWorkspacePath(relativePath)) {
    return err('workspace.unsafePath', {
      messageKey: 'errors.package.unsafePath',
      params: { path: relativePath },
    })
  }
  return ok(joinPath(workspace.rootPath, relativePath))
}
