import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { watch } from '@tauri-apps/plugin-fs'
import type { DocumentModel, DocumentWorkspace } from '../services/document/model'
import { resolveSaveTarget, type SaveTargetDecision } from '../services/document/save-strategy'
import { DocumentService } from '../services/document/document-service'
import { getDocumentPageLayout, normalizePageLayout, pageLayoutEquals, printDocument, type DocumentPageLayout } from '../services/document/page-layout'
import type { DocumentError } from '../services/document/errors'
import type { OpenDocumentResult } from '../services/document/document-service'
import { RecoveryService, type RecoveryState } from '../services/document/recovery-service'
import { PackageSecurityPolicy, type RemoteResourceType } from '../services/security/PackageSecurityPolicy'
import { createExternalChangeState, documentSourcePath, type DocumentExternalChangeState } from '../services/document/external-change-service'
import { fileDialogLabels, localizedText } from '../locales/file-dialog-labels'
import { createTemporaryWorkspace } from '../services/document/workspace-service'
import { containsBase64Images, findPackageResourceReferences } from '../services/assets/AssetManager'
import { debugLog } from '../services/debug-log'
import { authorizeDocumentPath, selectDocumentFile } from '../services/native-file'
import type { DocumentEditorAdapter } from '../components/Editor/editor-adapter'

export interface DocumentTab {
  id: string
  documentId: string
  name: string
  isDirty: boolean
}

export interface RecentFile {
  path: string
  name: string
  lastOpened: number
}

type StoredDocumentTab = Omit<DocumentTab, 'isDirty'>
export type DocumentSaveStatus = 'saved' | 'cancelled' | 'failed'
type ResourceSuggestion = NonNullable<OpenDocumentResult['resourceSuggestion']>

interface DocumentContextValue {
  tabs: DocumentTab[]
  activeTabId: string | null
  activeDocument: DocumentModel | null
  activeSaveDecision: SaveTargetDecision | null
  activePageLayout: DocumentPageLayout | null
  resourceSuggestion: OpenDocumentResult['resourceSuggestion'] | null
  documentError: DocumentError | null
  recoveryState: RecoveryState | null
  activeExternalChange: DocumentExternalChangeState | null
  activeSecurityPolicy: PackageSecurityPolicy | null
  recentFiles: RecentFile[]
  createNewDocument: () => void
  switchDocumentTab: (id: string) => void
  closeDocumentTab: (id: string) => void
  clearActiveDocument: () => void
  setActiveMarkdown: (markdown: string) => void
  updateActivePageLayout: (layout: DocumentPageLayout) => void
  printActiveDocument: () => void
  importActiveImageAsset: (file: File) => Promise<string | null>
  registerDocumentEditor: (documentId: string, adapter: DocumentEditorAdapter | null) => void
  scrollActiveEditorToOutlineItem: (id: string) => boolean
  getDocumentForTab: (id: string) => DocumentModel | null
  openFileFromPath: (path: string, name: string) => Promise<void>
  openFileDialog: () => Promise<void>
  saveDocumentTab: (id: string) => Promise<DocumentSaveStatus>
  saveActiveDocument: () => Promise<DocumentSaveStatus>
  saveActiveDocumentAsPackage: () => Promise<DocumentSaveStatus>
  retryRecovery: (documentId: string) => Promise<void>
  restoreRecovery: (documentId: string) => Promise<void>
  discardRecovery: (documentId: string) => void
  exportActiveDocx: (outputPath: string, referenceDocx?: string) => Promise<void>
  trustActiveDocument: () => void
  allowActiveRemoteResourceType: (type: RemoteResourceType) => void
  allowActiveRemoteDomain: (domain: string) => void
  allowActiveRemoteUrl: (url: string) => void
  dismissResourceSuggestion: () => void
  dismissDocumentError: () => void
  dismissRecoveryState: (documentId?: string) => void
  reloadExternalDocument: (documentId: string) => Promise<void>
  dismissExternalChange: (documentId: string) => void
  removeRecentFile: (path: string) => void
  clearRecentFiles: () => void
}

const DocumentContext = createContext<DocumentContextValue | null>(null)
let documentCounter = 0
const RECENT_KEY = 'mark-doc-recent-files'
const DEFAULT_SECURITY_POLICY = PackageSecurityPolicy.default()
const IMAGE_EXTENSION_PATTERN = /\.(apng|bmp|gif|ico|cur|jpe?g|jfif|pjpeg|pjp|png|svg|webp)$/i
const SELF_SAVE_SUPPRESSION_MS = 10_000

function nextId() {
  documentCounter += 1
  return `document-${documentCounter}`
}

function loadRecent(): RecentFile[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
  } catch {
    return []
  }
}

function saveRecent(files: RecentFile[]) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(files))
}

function nextTemporaryWorkspaceRoot(prefix: string, documentId: string) {
  return `/tmp/markdoc/${prefix}-${documentId}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function nextPastedAssetPath(file: File) {
  const extension = file.type === 'image/jpeg' ? 'jpg'
    : file.type === 'image/gif' ? 'gif'
      : file.type === 'image/webp' ? 'webp'
        : file.type === 'image/svg+xml' ? 'svg'
          : 'png'
  return `assets/pasted-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`
}

function isPastedImageFile(file: File) {
  return file.type.startsWith('image/') || IMAGE_EXTENSION_PATTERN.test(file.name)
}

function updateResourceSuggestion(
  previous: Record<string, ResourceSuggestion>,
  documentId: string,
  suggestion: OpenDocumentResult['resourceSuggestion'] | null | undefined,
) {
  const next = { ...previous }
  if (suggestion) next[documentId] = suggestion
  else delete next[documentId]
  return next
}

function introducedResourceReferences(previousMarkdown: string, nextMarkdown: string) {
  const previousReferences = new Set(findPackageResourceReferences(previousMarkdown))
  return findPackageResourceReferences(nextMarkdown).filter(reference => !previousReferences.has(reference))
}

function joinPath(...parts: string[]) {
  return parts
    .join('/')
    .replace(/\/+/g, '/')
    .replace(/^([A-Za-z]):\//, '$1:/')
}

function workspaceForPastedAsset(document: DocumentModel): DocumentWorkspace {
  if (document.workspace.rootPath && document.workspace.storage.type !== 'virtual-markdown') {
    return document.workspace
  }
  return createTemporaryWorkspace(nextTemporaryWorkspaceRoot('paste', document.id), document.id)
}

export function DocumentProvider({ children }: { children: ReactNode }) {
  const [documents, setDocuments] = useState<DocumentModel[]>([])
  const [tabs, setTabs] = useState<StoredDocumentTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [resourceSuggestions, setResourceSuggestions] = useState<Record<string, ResourceSuggestion>>({})
  const [documentError, setDocumentError] = useState<DocumentError | null>(null)
  const [recoveryStates, setRecoveryStates] = useState<Record<string, RecoveryState>>({})
  const [securityPolicies, setSecurityPolicies] = useState<Record<string, PackageSecurityPolicy>>({})
  const [externalChanges, setExternalChanges] = useState<Record<string, DocumentExternalChangeState>>({})
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(loadRecent)
  const documentService = useMemo(() => new DocumentService(), [])
  const recoveryService = useMemo(() => new RecoveryService(), [])
  const selfSaveUntilByPath = useRef(new Map<string, number>())
  const editorAdaptersRef = useRef(new Map<string, DocumentEditorAdapter>())
  const documentsRef = useRef(documents)
  documentsRef.current = documents

  const activeTab = tabs.find(tab => tab.id === activeTabId) || null
  const activeDocument = documents.find(document => document.id === activeTab?.documentId) || null
  const recoveryState = activeDocument ? recoveryStates[activeDocument.id] ?? null : null
  const activeExternalChange = activeDocument ? externalChanges[activeDocument.id] ?? null : null
  const activeSecurityPolicy = activeDocument ? securityPolicies[activeDocument.id] ?? DEFAULT_SECURITY_POLICY : null
  const activeSaveDecision = activeDocument ? resolveSaveTarget(activeDocument) : null
  const activePageLayout = activeDocument ? getDocumentPageLayout(activeDocument) : null
  const resourceSuggestion = activeDocument ? resourceSuggestions[activeDocument.id] ?? null : null
  const documentTabs = useMemo<DocumentTab[]>(() => tabs.map(tab => {
    const document = documents.find(document => document.id === tab.documentId)
    return {
      ...tab,
      isDirty: Boolean(document?.dirty.markdown || document?.dirty.assets || document?.dirty.presentation),
    }
  }), [documents, tabs])

  const createNewDocument = useCallback(() => {
    const id = nextId()
    const document: DocumentModel = {
      id,
      source: { type: 'new' },
      workspace: {
        id: `workspace-${id}`,
        entryPath: 'document.md',
        storage: { type: 'temporary', rootPath: '', recoveryKey: id },
      },
      markdown: '',
      metadata: {},
      assets: { references: [] },
      presentation: {},
      dirty: { markdown: false, assets: false, presentation: false },
    }
    const tab = { id: `tab-${id}`, documentId: id, name: localizedText('common.untitled', 'untitled.md') }

    setDocuments(previous => [...previous, document])
    setTabs(previous => [...previous, tab])
    setActiveTabId(tab.id)
  }, [])

  const switchDocumentTab = useCallback((id: string) => {
    setActiveTabId(id)
  }, [])

  const closeDocumentTab = useCallback((id: string) => {
    const closedDocumentId = tabs.find(tab => tab.id === id)?.documentId
    setTabs(previous => {
      const index = previous.findIndex(tab => tab.id === id)
      const next = previous.filter(tab => tab.id !== id)
      setActiveTabId(current => {
        if (current !== id) return current
        return next[Math.min(index, next.length - 1)]?.id ?? null
      })
      return next
    })
    setDocuments(previous => {
      return closedDocumentId
        ? previous.filter(document => document.id !== closedDocumentId)
        : previous
    })
    if (closedDocumentId) {
      editorAdaptersRef.current.delete(closedDocumentId)
      setResourceSuggestions(previous => updateResourceSuggestion(previous, closedDocumentId, null))
    }
  }, [tabs])

  const clearActiveDocument = useCallback(() => {
    setActiveTabId(null)
  }, [])

  const registerDocumentEditor = useCallback((documentId: string, adapter: DocumentEditorAdapter | null) => {
    if (adapter) {
      editorAdaptersRef.current.set(documentId, adapter)
      return
    }
    editorAdaptersRef.current.delete(documentId)
  }, [])

  const scrollActiveEditorToOutlineItem = useCallback((id: string) => {
    if (!activeDocument) return false
    return editorAdaptersRef.current.get(activeDocument.id)?.scrollToOutlineItem(id) ?? false
  }, [activeDocument])

  const getDocumentWithLiveMarkdown = useCallback((document: DocumentModel) => {
    const adapter = editorAdaptersRef.current.get(document.id)
    if (!adapter) return document

    const markdown = adapter.getMarkdown()
    if (markdown === document.markdown) return document

    return {
      ...document,
      markdown,
      dirty: { ...document.dirty, markdown: true },
    }
  }, [])

  const syncDocumentFromLiveEditor = useCallback((document: DocumentModel) => {
    const next = getDocumentWithLiveMarkdown(document)
    if (next !== document) {
      setDocuments(previous => previous.map(candidate => candidate.id === next.id ? next : candidate))
    }
    return next
  }, [getDocumentWithLiveMarkdown])

  const markSelfSavePath = useCallback((path: string | null | undefined) => {
    if (!path) return
    selfSaveUntilByPath.current.set(path, Date.now() + SELF_SAVE_SUPPRESSION_MS)
  }, [])

  const isSelfSavePath = useCallback((path: string) => {
    const ignoreUntil = selfSaveUntilByPath.current.get(path)
    if (!ignoreUntil) return false
    if (Date.now() <= ignoreUntil) return true
    selfSaveUntilByPath.current.delete(path)
    return false
  }, [])

  const setActiveMarkdown = useCallback((markdown: string) => {
    if (!activeDocument) return

    if (
      activeDocument.source.type === 'markdown'
      && introducedResourceReferences(activeDocument.markdown, markdown).length > 0
    ) {
      setResourceSuggestions(previous => updateResourceSuggestion(previous, activeDocument.id, { kind: 'suggest-mdoc', references: findPackageResourceReferences(markdown) }))
    }

    setDocuments(previous => previous.map(document => document.id === activeDocument.id
      ? { ...document, markdown, dirty: { ...document.dirty, markdown: true } }
      : document
    ))
  }, [activeDocument])

  const updateActivePageLayout = useCallback((layout: DocumentPageLayout) => {
    if (!activeDocument) return
    const page = normalizePageLayout(layout)
    setDocuments(previous => previous.map(document => {
      if (document.id !== activeDocument.id) return document
      if (pageLayoutEquals(getDocumentPageLayout(document), page)) return document
      return {
        ...document,
        presentation: { ...document.presentation, page },
        dirty: { ...document.dirty, presentation: true },
      }
    }))
  }, [activeDocument])

  const printActiveDocument = useCallback(() => {
    if (!activeDocument) return
    printDocument(getDocumentPageLayout(activeDocument))
  }, [activeDocument])

  const importActiveImageAsset = useCallback(async (file: File) => {
    debugLog('document.importImageAsset.start', {
      hasActiveDocument: Boolean(activeDocument),
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      recognized: isPastedImageFile(file),
    })
    if (!activeDocument || !isPastedImageFile(file)) return null

    const workspace = workspaceForPastedAsset(activeDocument)
    if (!workspace.rootPath) return null
    const assetPath = nextPastedAssetPath(file)
    const absoluteAssetPath = joinPath(workspace.rootPath, assetPath)
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()))

    await invoke('write_pasted_asset', { path: absoluteAssetPath, bytes })
    debugLog('document.importImageAsset.written', { assetPath, absoluteAssetPath })

    setDocuments(previous => previous.map(document => {
      if (document.id !== activeDocument.id) return document
      return {
        ...document,
        workspace,
        assets: {
          references: [...new Set([...document.assets.references, assetPath])],
        },
        dirty: { ...document.dirty, assets: true },
      }
    }))
    if (activeDocument.source.type === 'markdown' || activeDocument.source.type === 'new') {
      setResourceSuggestions(previous => updateResourceSuggestion(previous, activeDocument.id, { kind: 'suggest-mdoc', references: [assetPath] }))
    }
    debugLog('document.importImageAsset.done', { assetPath })
    return assetPath
  }, [activeDocument])

  const getDocumentForTab = useCallback((id: string) => {
    const tab = tabs.find(tab => tab.id === id)
    const document = documents.find(document => document.id === tab?.documentId) || null
    return document ? getDocumentWithLiveMarkdown(document) : null
  }, [documents, getDocumentWithLiveMarkdown, tabs])

  const addToRecent = useCallback((path: string, name: string) => {
    setRecentFiles(previous => {
      const next = previous.filter(file => file.path !== path).slice(0, 9)
      next.unshift({ path, name, lastOpened: Date.now() })
      saveRecent(next)
      return next
    })
  }, [])

  const removeRecentFile = useCallback((path: string) => {
    setRecentFiles(previous => {
      const next = previous.filter(file => file.path !== path)
      saveRecent(next)
      return next
    })
  }, [])

  const clearRecentFiles = useCallback(() => {
    setRecentFiles([])
    saveRecent([])
  }, [])

  const openFileFromPath = useCallback(async (path: string, name: string) => {
    try {
      await authorizeDocumentPath(path)
    } catch (cause) {
      setDocumentError({ code: 'open.failed', messageKey: 'errors.open.failed', params: { path }, cause })
      return
    }

    const existing = documents.find(document => (document.source.type === 'markdown' && document.source.path === path) || (document.source.type === 'package' && document.source.packagePath === path) || (document.source.type === 'docx' && document.source.originalPath === path))
    if (existing) {
      const tab = tabs.find(candidate => candidate.documentId === existing.id)
      if (tab) {
        setActiveTabId(tab.id)
        window.dispatchEvent(new CustomEvent('mark-doc:document-opened', { detail: path }))
        window.dispatchEvent(new CustomEvent('mark-doc:file-opened', { detail: path }))
      }
      addToRecent(path, name)
      return
    }
    const opened = await documentService.openPath(path)
    if (!opened.ok) {
      setDocumentError(opened.error)
      return
    }
    const tab = { id: `tab-${opened.value.document.id}`, documentId: opened.value.document.id, name }
    setDocuments(previous => [...previous, opened.value.document])
    setTabs(previous => [...previous, tab])
    setActiveTabId(tab.id)
    setResourceSuggestions(previous => updateResourceSuggestion(previous, opened.value.document.id, opened.value.resourceSuggestion))
    addToRecent(path, name)
    window.dispatchEvent(new CustomEvent('mark-doc:document-opened', { detail: path }))
    window.dispatchEvent(new CustomEvent('mark-doc:file-opened', { detail: path }))
  }, [addToRecent, documentService, documents, tabs])

  const openFileDialog = useCallback(async () => {
    const path = await selectDocumentFile({
      filters: [
        { name: fileDialogLabels.markdocPackage(), extensions: ['mdoc'] },
        { name: fileDialogLabels.markdown(), extensions: ['md', 'markdown'] },
        { name: fileDialogLabels.text(), extensions: ['txt'] },
        { name: fileDialogLabels.word(), extensions: ['docx', 'doc'] },
      ],
    })
    if (!path) return
    await openFileFromPath(path, path.replace(/\\/g, '/').split('/').pop() || 'untitled')
  }, [openFileFromPath])

  const openFileFromPathRef = useRef(openFileFromPath)
  openFileFromPathRef.current = openFileFromPath
  useEffect(() => {
    Promise.resolve(invoke<string[]>('take_pending_files')).then(paths => {
      if (!paths) return
      for (const path of paths) {
        void openFileFromPathRef.current(path, path.replace(/\\/g, '/').split('/').pop() || 'untitled')
      }
    }).catch(() => {})

    const unlisten = listen<string[]>('open-files', event => {
      for (const path of event.payload) {
        void openFileFromPathRef.current(path, path.replace(/\\/g, '/').split('/').pop() || 'untitled')
      }
    })
    return () => { void unlisten.then(dispose => dispose()) }
  }, [])

  const watchedDocumentPaths = documents
    .map(document => `${document.id}:${documentSourcePath(document) ?? ''}`)
    .join('|')
  useEffect(() => {
    let cancelled = false
    const unwatchers: Array<() => void> = []
    const start = async () => {
      for (const snapshot of documentsRef.current) {
        const path = documentSourcePath(snapshot)
        if (!path) continue
        try {
          const unwatch = await watch(path, () => {
            if (isSelfSavePath(path)) return
            const current = documentsRef.current.find(document => document.id === snapshot.id)
            if (!current) return
            const state = createExternalChangeState(current)
            if (state) setExternalChanges(previous => ({ ...previous, [current.id]: state }))
          }, { delayMs: 500 })
          if (cancelled) unwatch()
          else unwatchers.push(unwatch)
        } catch {
          // Watching is best-effort; open and save behavior remains available.
        }
      }
    }
    void start()
    return () => {
      cancelled = true
      unwatchers.forEach(unwatch => unwatch())
    }
  }, [isSelfSavePath, watchedDocumentPaths])

  const clearRecovery = useCallback((documentId: string) => {
    void recoveryService.clear(documentId)
    setRecoveryStates(previous => {
      const remaining = { ...previous }
      delete remaining[documentId]
      return remaining
    })
  }, [recoveryService])

  const saveDocument = useCallback(async (documentId: string): Promise<DocumentSaveStatus> => {
    const storedDocument = documents.find(candidate => candidate.id === documentId)
    if (!storedDocument) return 'failed'
    const document = syncDocumentFromLiveEditor(storedDocument)
    markSelfSavePath(documentSourcePath(document))
    debugLog('document.save.start', {
      documentId,
      sourceType: document.source.type,
      defaultKind: resolveSaveTarget(document).defaultKind,
      requiresDialog: resolveSaveTarget(document).requiresDialog,
      hasBase64: containsBase64Images(document.markdown),
      assets: document.assets.references.length,
    })
    const saved = await documentService.saveDocument(document)
    if (!saved.ok) {
      debugLog('document.save.failed', {
        code: saved.error.code,
        messageKey: saved.error.messageKey,
        params: saved.error.params,
        cause: String(saved.error.cause ?? ''),
      })
      setDocumentError(saved.error)
      if (saved.error.code === 'save.failed') {
        try {
          const recovery = await recoveryService.persistSaveFailure(document.id, {
            markdown: document.markdown,
            originalUnchanged: document.source.type !== 'markdown' && document.source.type !== 'directory',
            reason: 'unknown',
          })
          setRecoveryStates(previous => ({ ...previous, [document.id]: recovery }))
        } catch {
          // The save error remains visible; do not claim a persisted draft when writing it failed.
        }
      }
      return 'failed'
    }
    if (!saved.value) return 'cancelled'
    debugLog('document.save.done', {
      documentId,
      sourceType: saved.value.source.type,
      path: saved.value.source.type === 'markdown' ? saved.value.source.path
        : saved.value.source.type === 'package' ? saved.value.source.packagePath
          : '',
    })
    clearRecovery(document.id)
    setDocuments(previous => previous.map(candidate => candidate.id === document.id ? saved.value! : candidate))
    setResourceSuggestions(previous => updateResourceSuggestion(previous, document.id, null))
    const path = saved.value.source.type === 'markdown' ? saved.value.source.path
      : saved.value.source.type === 'package' ? saved.value.source.packagePath
        : null
    if (path) {
      markSelfSavePath(path)
      const name = path.split('/').pop() || 'untitled'
      addToRecent(path, name)
      setTabs(previous => previous.map(tab => tab.documentId === document.id
        ? { ...tab, name: name || tab.name }
        : tab
      ))
    }
    setExternalChanges(previous => {
      const remaining = { ...previous }
      delete remaining[document.id]
      return remaining
    })
    return 'saved'
  }, [addToRecent, clearRecovery, documentService, documents, markSelfSavePath, recoveryService, syncDocumentFromLiveEditor])

  const saveDocumentTab = useCallback(async (id: string) => {
    const tab = tabs.find(candidate => candidate.id === id)
    return tab ? saveDocument(tab.documentId) : Promise.resolve<DocumentSaveStatus>('failed')
  }, [saveDocument, tabs])

  const saveActiveDocument = useCallback(async (): Promise<DocumentSaveStatus> => {
    return activeDocument ? saveDocument(activeDocument.id) : 'failed'
  }, [activeDocument, saveDocument])

  const saveActiveDocumentAsPackage = useCallback(async (): Promise<DocumentSaveStatus> => {
    if (!activeDocument) return 'failed'
    const document = syncDocumentFromLiveEditor(activeDocument)
    markSelfSavePath(documentSourcePath(document))
    debugLog('document.saveAsPackage.start', {
      documentId: document.id,
      sourceType: document.source.type,
      hasBase64: containsBase64Images(document.markdown),
      assets: document.assets.references.length,
    })
    const saved = await documentService.saveDocumentAsPackage(document)
    if (!saved.ok) {
      debugLog('document.saveAsPackage.failed', {
        code: saved.error.code,
        messageKey: saved.error.messageKey,
        params: saved.error.params,
        cause: String(saved.error.cause ?? ''),
      })
      setDocumentError(saved.error)
      if (saved.error.code === 'save.failed') {
        try {
          const recovery = await recoveryService.persistSaveFailure(document.id, {
            markdown: document.markdown,
            originalUnchanged: true,
            reason: 'unknown',
          })
          setRecoveryStates(previous => ({ ...previous, [document.id]: recovery }))
        } catch {
          // The save error remains visible; do not claim a persisted draft when writing it failed.
        }
      }
      return 'failed'
    }
    if (!saved.value) return 'cancelled'
    debugLog('document.saveAsPackage.done', {
      documentId: document.id,
      sourceType: saved.value.source.type,
      path: saved.value.source.type === 'package' ? saved.value.source.packagePath : '',
    })
    clearRecovery(document.id)
    setDocuments(previous => previous.map(candidate => candidate.id === document.id ? saved.value! : candidate))
    setResourceSuggestions(previous => updateResourceSuggestion(previous, document.id, null))
    setTabs(previous => previous.map(tab => tab.documentId === document.id
      ? { ...tab, name: saved.value!.source.type === 'package' ? saved.value!.source.packagePath.split('/').pop() || tab.name : tab.name }
      : tab
    ))
    if (saved.value.source.type === 'package') {
      markSelfSavePath(saved.value.source.packagePath)
      addToRecent(saved.value.source.packagePath, saved.value.source.packagePath.split('/').pop() || 'untitled.mdoc')
    }
    return 'saved'
  }, [activeDocument, addToRecent, clearRecovery, documentService, markSelfSavePath, recoveryService, syncDocumentFromLiveEditor])

  const retryRecovery = useCallback(async (documentId: string) => {
    await saveDocument(documentId)
  }, [saveDocument])

  const discardRecovery = useCallback((documentId: string) => {
    clearRecovery(documentId)
  }, [clearRecovery])

  const restoreRecovery = useCallback(async (documentId: string) => {
    const recovery = recoveryStates[documentId] ?? recoveryService.get(documentId)
    if (!recovery) return
    const markdown = await recoveryService.restoreDraft(documentId)
    if (markdown === null) return
    setDocuments(previous => previous.map(document => document.id === documentId
      ? { ...document, markdown, dirty: { ...document.dirty, markdown: true } }
      : document
    ))
    clearRecovery(documentId)
  }, [clearRecovery, recoveryService, recoveryStates])

  const exportActiveDocx = useCallback(async (outputPath: string, referenceDocx?: string) => {
    if (!activeDocument) return
    const document = syncDocumentFromLiveEditor(activeDocument)
    const exported = await documentService.exportDocx(document, outputPath, referenceDocx)
    if (!exported.ok) setDocumentError(exported.error)
  }, [activeDocument, documentService, syncDocumentFromLiveEditor])

  const dismissExternalChange = useCallback((documentId: string) => {
    setExternalChanges(previous => {
      const remaining = { ...previous }
      delete remaining[documentId]
      return remaining
    })
  }, [])

  const reloadExternalDocument = useCallback(async (documentId: string) => {
    const state = externalChanges[documentId]
    if (!state) return
    const opened = await documentService.openPath(state.path)
    if (!opened.ok) {
      setDocumentError(opened.error)
      return
    }
    const reloaded = { ...opened.value.document, id: documentId }
    setDocuments(previous => previous.map(document => document.id === documentId ? reloaded : document))
    setResourceSuggestions(previous => updateResourceSuggestion(previous, documentId, opened.value.resourceSuggestion))
    dismissExternalChange(documentId)
  }, [dismissExternalChange, documentService, externalChanges])

  const dismissResourceSuggestion = useCallback(() => {
    if (!activeDocument) return
    setResourceSuggestions(previous => updateResourceSuggestion(previous, activeDocument.id, null))
  }, [activeDocument])
  const dismissDocumentError = useCallback(() => setDocumentError(null), [])
  const dismissRecoveryState = useCallback((documentId?: string) => {
    if (documentId) clearRecovery(documentId)
    else if (activeDocument) clearRecovery(activeDocument.id)
  }, [activeDocument, clearRecovery])

  const updateActiveSecurityPolicy = useCallback((update: (policy: PackageSecurityPolicy) => PackageSecurityPolicy) => {
    if (!activeDocument) return
    setSecurityPolicies(previous => ({
      ...previous,
      [activeDocument.id]: update(previous[activeDocument.id] ?? DEFAULT_SECURITY_POLICY),
    }))
  }, [activeDocument])

  const trustActiveDocument = useCallback(() => updateActiveSecurityPolicy(policy => policy.trustDocument()), [updateActiveSecurityPolicy])
  const allowActiveRemoteResourceType = useCallback((type: RemoteResourceType) => updateActiveSecurityPolicy(policy => policy.allowResourceType(type)), [updateActiveSecurityPolicy])
  const allowActiveRemoteDomain = useCallback((domain: string) => updateActiveSecurityPolicy(policy => policy.allowDomain(domain)), [updateActiveSecurityPolicy])
  const allowActiveRemoteUrl = useCallback((url: string) => updateActiveSecurityPolicy(policy => policy.allowUrl(url)), [updateActiveSecurityPolicy])

  const value = useMemo(() => ({
    tabs: documentTabs,
    activeTabId,
    activeDocument,
    activeSaveDecision,
    activePageLayout,
    resourceSuggestion,
    documentError,
    recoveryState,
    activeExternalChange,
    activeSecurityPolicy,
    recentFiles,
    createNewDocument,
    switchDocumentTab,
    closeDocumentTab,
    clearActiveDocument,
    setActiveMarkdown,
    updateActivePageLayout,
    printActiveDocument,
    importActiveImageAsset,
    registerDocumentEditor,
    scrollActiveEditorToOutlineItem,
    getDocumentForTab,
    openFileFromPath,
    openFileDialog,
    saveDocumentTab,
    saveActiveDocument,
    saveActiveDocumentAsPackage,
    retryRecovery,
    restoreRecovery,
    discardRecovery,
    exportActiveDocx,
    trustActiveDocument,
    allowActiveRemoteResourceType,
    allowActiveRemoteDomain,
    allowActiveRemoteUrl,
    dismissResourceSuggestion,
    dismissDocumentError,
    dismissRecoveryState,
    reloadExternalDocument,
    dismissExternalChange,
    removeRecentFile,
    clearRecentFiles,
  }), [
    documentTabs,
    activeTabId,
    activeDocument,
    activeSaveDecision,
    activePageLayout,
    resourceSuggestion,
    documentError,
    recoveryState,
    activeExternalChange,
    activeSecurityPolicy,
    recentFiles,
    createNewDocument,
    switchDocumentTab,
    closeDocumentTab,
    clearActiveDocument,
    setActiveMarkdown,
    updateActivePageLayout,
    printActiveDocument,
    importActiveImageAsset,
    registerDocumentEditor,
    scrollActiveEditorToOutlineItem,
    getDocumentForTab,
    openFileFromPath,
    openFileDialog,
    saveDocumentTab,
    saveActiveDocument,
    saveActiveDocumentAsPackage,
    retryRecovery,
    restoreRecovery,
    discardRecovery,
    exportActiveDocx,
    trustActiveDocument,
    allowActiveRemoteResourceType,
    allowActiveRemoteDomain,
    allowActiveRemoteUrl,
    dismissResourceSuggestion,
    dismissDocumentError,
    dismissRecoveryState,
    reloadExternalDocument,
    dismissExternalChange,
    removeRecentFile,
    clearRecentFiles,
  ])

  return <DocumentContext.Provider value={value}>{children}</DocumentContext.Provider>
}

export function useDocument() {
  const context = useContext(DocumentContext)
  if (!context) throw new Error('useDocument must be used within DocumentProvider')
  return context
}
