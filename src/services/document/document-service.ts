import { mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { save } from '@tauri-apps/plugin-dialog'
import { ok, type Result } from './errors'
import type { DocumentSession } from './session-store'
import { DocumentSessionStore } from './session-store'
import { MarkdownImporter } from '../importers/MarkdownImporter'
import { DocxImporter } from '../importers/DocxImporter'
import { PackageImporter } from '../importers/PackageImporter'
import { DocxExporter } from '../exporters/DocxExporter'
import { PackageExporter } from '../exporters/PackageExporter'
import type { DocumentModel } from './model'
import { resolveSaveTarget } from './save-strategy'

export interface OpenDocumentResult extends DocumentSession {
  resourceSuggestion?: {
    kind: 'suggest-mdoc'
    references: string[]
  }
}

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
      resourceSuggestion: imported.value.localResourceReferences.length > 0
        ? { kind: 'suggest-mdoc', references: imported.value.localResourceReferences }
        : undefined,
    })
  }

  async openPath(path: string): Promise<Result<DocumentModel>> {
    const lower = path.toLowerCase()
    if (lower.endsWith('.mdoc')) return this.packageImporter.open(path, this.nextWorkspaceRoot('package'))
    if (lower.endsWith('.docx')) return this.docxImporter.import(path, this.nextWorkspaceRoot('docx'))
    const markdown = await readTextFile(path)
    const result = await this.openMarkdown(path, markdown)
    return result.ok ? ok(result.value.document) : result
  }

  async saveDocument(document: DocumentModel): Promise<Result<DocumentModel | null>> {
    const decision = resolveSaveTarget(document)
    if (!decision.requiresDialog && document.source.type === 'markdown') {
      await writeTextFile(document.source.path, document.markdown)
      return ok({ ...document, dirty: { markdown: false, assets: false, presentation: false } })
    }

    const defaultName = this.defaultSaveName(document, decision.defaultKind)
    const outputPath = decision.requiresDialog
      ? await save({ filters: [{ name: 'MarkDoc Package', extensions: ['mdoc'] }, { name: 'Markdown', extensions: ['md'] }], defaultPath: defaultName })
      : document.source.type === 'package' ? document.source.packagePath : null
    if (!outputPath) return ok(null)
    if (outputPath.toLowerCase().endsWith('.md')) {
      await writeTextFile(outputPath, document.markdown)
      return ok({ ...document, source: { type: 'markdown', path: outputPath }, dirty: { markdown: false, assets: false, presentation: false } })
    }

    const packagePath = outputPath.toLowerCase().endsWith('.mdoc') ? outputPath : `${outputPath}.mdoc`
    const workspace = await this.ensurePackageWorkspace(document)
    const exported = await this.packageExporter.export(workspace, { outputPath: packagePath, files: ['document.md'] })
    if (!exported.ok) return exported
    return ok({ ...document, source: { type: 'package', packagePath, extractedWorkspacePath: workspace.rootPath! }, workspace, dirty: { markdown: false, assets: false, presentation: false } })
  }

  async exportDocx(document: DocumentModel, outputPath: string, referenceDocx?: string): Promise<Result<{ outputPath: string }>> {
    const workspace = await this.ensurePackageWorkspace(document)
    return this.docxExporter.export({
      markdownPath: workspace.entryPath,
      outputPath,
      referenceDocx: referenceDocx ?? document.presentation.docx?.referenceDocx,
    })
  }

  private nextWorkspaceRoot(kind: string) {
    return `/tmp/markdoc/${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }

  private defaultSaveName(document: DocumentModel, kind: 'mdoc' | 'markdown' | 'docx') {
    const sourcePath = document.source.type === 'markdown' ? document.source.path
      : document.source.type === 'package' ? document.source.packagePath
        : document.source.type === 'docx' ? document.source.originalPath : 'untitled'
    return sourcePath.split('/').pop()!.replace(/\.(md|mdoc|docx)$/i, '') + `.${kind === 'markdown' ? 'md' : kind}`
  }

  private async ensurePackageWorkspace(document: DocumentModel) {
    const rootPath = document.workspace.rootPath || this.nextWorkspaceRoot('save')
    const workspace = { ...document.workspace, rootPath, entryPath: `${rootPath}/document.md`, storage: { type: 'temporary' as const, rootPath, recoveryKey: document.id } }
    await mkdir(rootPath, { recursive: true })
    await writeTextFile(workspace.entryPath, document.markdown)
    return workspace
  }
}
