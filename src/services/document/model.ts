export type DocumentSource =
  | { type: 'markdown'; path: string }
  | { type: 'directory'; rootPath: string; entryPath: string }
  | { type: 'package'; packagePath: string; extractedWorkspacePath: string }
  | { type: 'docx'; originalPath: string; workspacePath: string }
  | { type: 'new' }

export type WorkspaceStorage =
  | { type: 'virtual-markdown'; markdownPath: string }
  | { type: 'directory'; rootPath: string }
  | { type: 'temporary'; rootPath: string; recoveryKey: string }

export interface DocumentWorkspace {
  id: string
  rootPath?: string
  entryPath: string
  assetsPath?: string
  presentationPath?: string
  manifestPath?: string
  packageEntries?: string[]
  packageManifest?: object & { entry?: string }
  packageQuarantined?: string[]
  packageMissingManifestResources?: string[]
  packageRecovered?: boolean
  storage: WorkspaceStorage
}

export interface PresentationConfig {
  profile?: string
  screen?: string
  print?: string
  docx?: {
    referenceDocx?: string
  }
}

export interface DocumentMetadata {
  title?: string
  lang?: string
  frontmatter?: Record<string, unknown>
}

export interface AssetRegistry {
  references: string[]
}

export interface DocumentDirtyState {
  markdown: boolean
  assets: boolean
  presentation: boolean
}

export interface DocumentModel {
  id: string
  source: DocumentSource
  workspace: DocumentWorkspace
  markdown: string
  metadata: DocumentMetadata
  assets: AssetRegistry
  presentation: PresentationConfig
  dirty: DocumentDirtyState
}
