import { err, ok, type Result } from './errors'
import type { DocumentSession } from './session-store'
import { DocumentSessionStore } from './session-store'
import { MarkdownImporter } from '../importers/MarkdownImporter'
import { DocxImporter } from '../importers/DocxImporter'
import { PackageImporter } from '../importers/PackageImporter'
import { DocxExporter } from '../exporters/DocxExporter'
import { PackageExporter } from '../exporters/PackageExporter'
import type { DocumentModel, DocumentWorkspace } from './model'
import { resolveSaveTarget } from './save-strategy'
import { createTemporaryWorkspace } from './workspace-service'
import { getDocumentPageLayout, mergePageLayoutIntoManifest } from './page-layout'
import { fileDialogLabels } from '../../locales/file-dialog-labels'
import { findLocalAssetReferences } from '../assets/AssetManager'
import { copyFile, readTextFile, selectSavePath, writeTextFile } from '../native-file'

class PackageAssetCopyError extends Error {
  constructor(readonly resourcePath: string, readonly originalCause: unknown) {
    super(`Failed to copy package resource: ${resourcePath}`)
    this.name = 'PackageAssetCopyError'
  }
}

function toAssetCopySaveError(cause: unknown): Result<never> | null {
  if (!(cause instanceof PackageAssetCopyError)) return null
  return err('save.failed', {
    messageKey: 'errors.package.assetCopyFailed',
    params: { path: cause.resourcePath },
    cause: cause.originalCause,
  })
}

export interface OpenDocumentResult extends DocumentSession {
  resourceSuggestion?: {
    kind: 'suggest-mdoc'
    references: string[]
  }
}

export interface OpenPathResult {
  document: DocumentModel
  resourceSuggestion?: OpenDocumentResult['resourceSuggestion']
}

export type DocxTemplateSelection =
  | { type: 'builtin'; id: 'daily' | 'formal' }
  | { type: 'original' }
  | { type: 'custom'; path: string }

export class DocumentService {
  private sessions = new DocumentSessionStore()
  private markdownImporter = new MarkdownImporter()
  private docxImporter = new DocxImporter()
  private packageImporter = new PackageImporter()
  private docxExporter = new DocxExporter()
  private packageExporter = new PackageExporter()

  async openMarkdown(path: string, markdown: string): Promise<Result<OpenDocumentResult>> {
    const imported = this.markdownImporter.import(path, markdown)
    if (!imported.ok) return imported

    this.sessions.add(imported.value.document)
    const session = this.sessions.get(imported.value.document.id)!
    return ok({
      ...session,
      resourceSuggestion: imported.value.packageResourceReferences.length > 0
        ? { kind: 'suggest-mdoc', references: imported.value.packageResourceReferences }
        : undefined,
    })
  }

  async openPath(path: string): Promise<Result<OpenPathResult>> {
    try {
      const lower = path.toLowerCase()
      if (lower.endsWith('.mdoc')) {
        const result = await this.packageImporter.open(path, this.nextWorkspaceRoot('package'))
        return result.ok ? ok({ document: result.value }) : result
      }
      if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
        const result = await this.docxImporter.import(path, this.nextWorkspaceRoot('docx'))
        return result.ok ? ok({ document: result.value }) : result
      }
      const markdown = await readTextFile(path)
      const result = await this.openMarkdown(path, markdown)
      return result.ok ? ok({ document: result.value.document, resourceSuggestion: result.value.resourceSuggestion }) : result
    } catch (cause) {
      return err('open.failed', { messageKey: 'errors.open.failed', params: { path }, cause })
    }
  }

  async saveDocument(document: DocumentModel): Promise<Result<DocumentModel | null>> {
    try {
      const decision = resolveSaveTarget(document)
      if (!decision.requiresDialog && document.source.type === 'markdown') {
        await writeTextFile(document.source.path, document.markdown)
        return ok({ ...document, dirty: { markdown: false, assets: false, presentation: false } })
      }

      const defaultName = this.defaultSaveName(document, decision.defaultKind)
      const outputPath = decision.requiresDialog
        ? await selectSavePath({ filters: [{ name: fileDialogLabels.markdocPackage(), extensions: ['mdoc'] }, { name: fileDialogLabels.markdown(), extensions: ['md'] }], defaultPath: defaultName })
        : document.source.type === 'package' ? document.source.packagePath : null
      if (!outputPath) return ok(null)
      if (outputPath.toLowerCase().endsWith('.md')) {
        await writeTextFile(outputPath, document.markdown)
        return ok({ ...document, source: { type: 'markdown', path: outputPath }, dirty: { markdown: false, assets: false, presentation: false } })
      }

      const packagePath = outputPath.toLowerCase().endsWith('.mdoc') ? outputPath : `${outputPath}.mdoc`
      const workspace = await this.ensurePackageWorkspace(document)
      const entry = this.packageEntryPath(document, workspace)
      const files = this.packageFiles(document, workspace, entry)
      const manifest = this.packageManifestForExport(document, entry)
      const exportedWorkspace = manifest ? { ...workspace, packageManifest: manifest } : workspace
      const exported = await this.packageExporter.export(workspace, {
        outputPath: packagePath,
        entry,
        files,
        manifest,
        sourcePackagePath: document.source.type === 'package' ? document.source.packagePath : undefined,
        preservedFiles: this.preservedPackageFiles(document, entry),
      })
      if (!exported.ok) return exported
      return ok({ ...document, source: { type: 'package', packagePath, extractedWorkspacePath: workspace.rootPath! }, workspace: exportedWorkspace, dirty: { markdown: false, assets: false, presentation: false } })
    } catch (cause) {
      const assetCopyError = toAssetCopySaveError(cause)
      if (assetCopyError) return assetCopyError
      return err('save.failed', { messageKey: 'errors.save.failed', cause })
    }
  }

  async saveDocumentAsPackage(document: DocumentModel): Promise<Result<DocumentModel | null>> {
    try {
      const defaultName = this.defaultSaveName(document, 'mdoc')
      const outputPath = await selectSavePath({
        filters: [{ name: fileDialogLabels.markdocPackage(), extensions: ['mdoc'] }],
        defaultPath: defaultName,
      })
      if (!outputPath) return ok(null)

      const packagePath = outputPath.toLowerCase().endsWith('.mdoc') ? outputPath : `${outputPath}.mdoc`
      const workspace = await this.ensurePackageWorkspace(document)
      const entry = this.packageEntryPath(document, workspace)
      const files = this.packageFiles(document, workspace, entry)
      const manifest = this.packageManifestForExport(document, entry)
      const exportedWorkspace = manifest ? { ...workspace, packageManifest: manifest } : workspace
      const exported = await this.packageExporter.export(workspace, {
        outputPath: packagePath,
        entry,
        files,
        manifest,
        sourcePackagePath: document.source.type === 'package' ? document.source.packagePath : undefined,
        preservedFiles: this.preservedPackageFiles(document, entry),
      })
      if (!exported.ok) return exported
      return ok({ ...document, source: { type: 'package', packagePath, extractedWorkspacePath: workspace.rootPath! }, workspace: exportedWorkspace, dirty: { markdown: false, assets: false, presentation: false } })
    } catch (cause) {
      const assetCopyError = toAssetCopySaveError(cause)
      if (assetCopyError) return assetCopyError
      return err('save.failed', { messageKey: 'errors.save.failed', cause })
    }
  }

  async exportDocx(document: DocumentModel, outputPath: string, template: DocxTemplateSelection = { type: 'builtin', id: 'daily' }): Promise<Result<{ outputPath: string }>> {
    try {
      const referenceDocx = template.type === 'original' ? document.presentation.docx?.referenceDocx
        : template.type === 'custom' ? template.path : undefined
      if (template.type !== 'builtin' && !referenceDocx) {
        return err('export.docxFailed', { messageKey: 'errors.export.docxFailed' })
      }
      const workspace = await this.ensurePackageWorkspace(document)
      return this.docxExporter.export({
        markdownPath: workspace.entryPath,
        outputPath,
        referenceDocx,
        builtinTemplate: template.type === 'builtin' ? template.id : undefined,
        // Explicit document layout wins; otherwise user templates keep their own page geometry.
        pageLayout: document.presentation.page || (template.type === 'builtin' && template.id !== 'formal'
          ? getDocumentPageLayout(document) : undefined),
      })
    } catch (cause) {
      return err('export.docxFailed', { messageKey: 'errors.export.docxFailed', cause })
    }
  }

  private nextWorkspaceRoot(kind: string) {
    return `/tmp/markdoc/${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }

  private defaultSaveName(document: DocumentModel, kind: 'mdoc' | 'markdown' | 'docx') {
    const sourcePath = document.source.type === 'markdown' ? document.source.path
      : document.source.type === 'package' ? document.source.packagePath
        : document.source.type === 'docx' ? document.source.originalPath : 'untitled'
    return sourcePath.split('/').pop()!.replace(/\.(md|markdown|mdoc|txt|docx|doc)$/i, '') + `.${kind === 'markdown' ? 'md' : kind}`
  }

  private async ensurePackageWorkspace(document: DocumentModel): Promise<DocumentWorkspace> {
    if (document.source.type === 'package') {
      const rootPath = document.workspace.rootPath || document.source.extractedWorkspacePath
      const entry = this.packageEntryPath(document, { ...document.workspace, rootPath })
      const workspace = {
        ...document.workspace,
        rootPath,
        entryPath: `${rootPath}/${entry}`,
        storage: { type: 'temporary' as const, rootPath, recoveryKey: document.id },
      }
      await writeTextFile(workspace.entryPath, document.markdown)
      return workspace
    }

    const rootPath = this.nextWorkspaceRoot('save')
    const workspace = createTemporaryWorkspace(rootPath, document.id)
    await writeTextFile(workspace.entryPath, document.markdown)
    const copiedReferences: string[] = []
    for (const reference of this.currentAssetReferences(document).filter(path => this.isSafePackagePath(path))) {
      if (!document.workspace.rootPath) continue
      const targetPath = `${rootPath}/${reference}`
      try {
        await copyFile(`${document.workspace.rootPath}/${reference}`, targetPath)
        copiedReferences.push(reference)
      } catch (cause) {
        throw new PackageAssetCopyError(reference, cause)
      }
    }
    return { ...workspace, packageEntries: ['document.md', ...copiedReferences] }
  }

  private packageEntryPath(document: DocumentModel, workspace: Pick<DocumentModel['workspace'], 'entryPath' | 'rootPath' | 'packageManifest'>) {
    if (document.source.type !== 'package') return 'document.md'
    const manifestEntry = typeof workspace.packageManifest?.entry === 'string' ? workspace.packageManifest.entry : undefined
    if (manifestEntry) return manifestEntry
    if (workspace.rootPath && workspace.entryPath.startsWith(`${workspace.rootPath}/`)) {
      return workspace.entryPath.slice(workspace.rootPath.length + 1)
    }
    return 'document.md'
  }

  private packageFiles(document: DocumentModel, workspace: DocumentWorkspace, entry: string) {
    const candidates = workspace.packageEntries?.length
      ? [entry, ...workspace.packageEntries, ...(document.source.type === 'package' ? this.currentAssetReferences(document) : [])]
      : [entry, ...this.currentAssetReferences(document)]
    return [...new Set(candidates.filter(path => this.isPackageContentPath(path, entry)))].sort()
  }

  private preservedPackageFiles(document: DocumentModel, entry: string) {
    return document.source.type === 'package'
      ? [...new Set((document.workspace.packageQuarantined ?? []).filter(path => this.isPackageContentPath(path, entry)))].sort()
      : []
  }

  private currentAssetReferences(document: DocumentModel) {
    return [...new Set([...document.assets.references, ...findLocalAssetReferences(document.markdown)])]
  }

  private packageManifestForExport(document: DocumentModel, entry: string) {
    return document.workspace.packageManifest || document.presentation.page
      ? mergePageLayoutIntoManifest(document.workspace.packageManifest, entry, document.presentation.page)
      : undefined
  }

  private isPackageContentPath(path: string, entry: string) {
    if (!this.isSafePackagePath(path)) return false
    if (path === 'manifest.json') return false
    if (path === 'README.md' && path !== entry) return false
    return true
  }

  private isSafePackagePath(path: string) {
    return Boolean(path)
      && !path.startsWith('/')
      && !path.includes('\\')
      && !path.split('/').includes('..')
      && !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(path)
  }
}
