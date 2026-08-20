import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { watch } from '@tauri-apps/plugin-fs'
import type { DocumentModel } from '../services/document/model'
import { resolveSaveTarget, type SaveTargetDecision } from '../services/document/save-strategy'
import { DocumentService } from '../services/document/document-service'
import type { DocumentError } from '../services/document/errors'
import type { OpenDocumentResult } from '../services/document/document-service'
import { RecoveryService, type RecoveryState } from '../services/document/recovery-service'
import { PackageSecurityPolicy, type RemoteResourceType } from '../services/security/PackageSecurityPolicy'
import { createExternalChangeState, documentSourcePath, type DocumentExternalChangeState } from '../services/document/external-change-service'

export interface DocumentTab {
  id: string
  documentId: string
  name: string
  isDirty: boolean
}

type StoredDocumentTab = Omit<DocumentTab, 'isDirty'>
export type DocumentSaveStatus = 'saved' | 'cancelled' | 'failed'

interface DocumentContextValue {
  tabs: DocumentTab[]
  activeTabId: string | null
  activeDocument: DocumentModel | null
  activeSaveDecision: SaveTargetDecision | null
  resourceSuggestion: OpenDocumentResult['resourceSuggestion'] | null
  documentError: DocumentError | null
  recoveryState: RecoveryState | null
  activeExternalChange: DocumentExternalChangeState | null
  activeSecurityPolicy: PackageSecurityPolicy | null
  createNewDocument: () => void
  switchDocumentTab: (id: string) => void
  closeDocumentTab: (id: string) => void
  clearActiveDocument: () => void
  setActiveMarkdown: (markdown: string) => void
  getDocumentForTab: (id: string) => DocumentModel | null
  openFileFromPath: (path: string, name: string) => Promise<void>
  saveDocumentTab: (id: string) => Promise<DocumentSaveStatus>
  saveActiveDocument: () => Promise<DocumentSaveStatus>
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
}

const DocumentContext = createContext<DocumentContextValue | null>(null)
let documentCounter = 0

function nextId() {
  documentCounter += 1
  return `document-${documentCounter}`
}

export function DocumentProvider({ children }: { children: ReactNode }) {
  const [documents, setDocuments] = useState<DocumentModel[]>([])
  const [tabs, setTabs] = useState<StoredDocumentTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [resourceSuggestion, setResourceSuggestion] = useState<OpenDocumentResult['resourceSuggestion'] | null>(null)
  const [documentError, setDocumentError] = useState<DocumentError | null>(null)
  const [recoveryStates, setRecoveryStates] = useState<Record<string, RecoveryState>>({})
  const [securityPolicies, setSecurityPolicies] = useState<Record<string, PackageSecurityPolicy>>({})
  const [externalChanges, setExternalChanges] = useState<Record<string, DocumentExternalChangeState>>({})
  const documentService = useMemo(() => new DocumentService(), [])
  const recoveryService = useMemo(() => new RecoveryService(), [])
  const selfSaveTimestamps = useRef(new Map<string, number>())
  const documentsRef = useRef(documents)
  documentsRef.current = documents

  const activeTab = tabs.find(tab => tab.id === activeTabId) || null
  const activeDocument = documents.find(document => document.id === activeTab?.documentId) || null
  const recoveryState = activeDocument ? recoveryStates[activeDocument.id] ?? null : null
  const activeExternalChange = activeDocument ? externalChanges[activeDocument.id] ?? null : null
  const activeSecurityPolicy = activeDocument ? securityPolicies[activeDocument.id] ?? PackageSecurityPolicy.default() : null
  const activeSaveDecision = activeDocument ? resolveSaveTarget(activeDocument) : null
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
    const tab = { id: `tab-${id}`, documentId: id, name: 'untitled.mdoc' }

    setDocuments(previous => [...previous, document])
    setTabs(previous => [...previous, tab])
    setActiveTabId(tab.id)
  }, [])

  const switchDocumentTab = useCallback((id: string) => {
    setActiveTabId(id)
  }, [])

  const closeDocumentTab = useCallback((id: string) => {
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
      const closedDocumentId = tabs.find(tab => tab.id === id)?.documentId
      return closedDocumentId
        ? previous.filter(document => document.id !== closedDocumentId)
        : previous
    })
  }, [tabs])

  const clearActiveDocument = useCallback(() => {
    setActiveTabId(null)
  }, [])

  const setActiveMarkdown = useCallback((markdown: string) => {
    if (!activeDocument) return

    setDocuments(previous => previous.map(document => document.id === activeDocument.id
      ? { ...document, markdown, dirty: { ...document.dirty, markdown: true } }
      : document
    ))
  }, [activeDocument])

  const getDocumentForTab = useCallback((id: string) => {
    const tab = tabs.find(tab => tab.id === id)
    return documents.find(document => document.id === tab?.documentId) || null
  }, [documents, tabs])

  const openFileFromPath = useCallback(async (path: string, name: string) => {
    const existing = documents.find(document => (document.source.type === 'markdown' && document.source.path === path) || (document.source.type === 'package' && document.source.packagePath === path) || (document.source.type === 'docx' && document.source.originalPath === path))
    if (existing) {
      const tab = tabs.find(candidate => candidate.documentId === existing.id)
      if (tab) {
        setActiveTabId(tab.id)
        window.dispatchEvent(new CustomEvent('mark-doc:document-opened', { detail: path }))
        window.dispatchEvent(new CustomEvent('mark-doc:file-opened', { detail: path }))
      }
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
    setResourceSuggestion(opened.value.resourceSuggestion ?? null)
    window.dispatchEvent(new CustomEvent('mark-doc:document-opened', { detail: path }))
    window.dispatchEvent(new CustomEvent('mark-doc:file-opened', { detail: path }))
  }, [documentService, documents, tabs])

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
            const saveTime = selfSaveTimestamps.current.get(path)
            if (saveTime && Date.now() - saveTime < 2000) return
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
  }, [watchedDocumentPaths])

  const clearRecovery = useCallback((documentId: string) => {
    void recoveryService.clear(documentId)
    setRecoveryStates(previous => {
      const remaining = { ...previous }
      delete remaining[documentId]
      return remaining
    })
  }, [recoveryService])

  const saveDocument = useCallback(async (documentId: string): Promise<DocumentSaveStatus> => {
    const document = documents.find(candidate => candidate.id === documentId)
    if (!document) return 'failed'
    const saved = await documentService.saveDocument(document)
    if (!saved.ok) {
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
    clearRecovery(document.id)
    setDocuments(previous => previous.map(candidate => candidate.id === document.id ? saved.value! : candidate))
    const path = saved.value.source.type === 'markdown' ? saved.value.source.path
      : saved.value.source.type === 'package' ? saved.value.source.packagePath
        : null
    if (path) {
      selfSaveTimestamps.current.set(path, Date.now())
      setTabs(previous => previous.map(tab => tab.documentId === document.id
        ? { ...tab, name: path.split('/').pop() || tab.name }
        : tab
      ))
    }
    setExternalChanges(previous => {
      const remaining = { ...previous }
      delete remaining[document.id]
      return remaining
    })
    return 'saved'
  }, [clearRecovery, documentService, documents, recoveryService])

  const saveDocumentTab = useCallback(async (id: string) => {
    const tab = tabs.find(candidate => candidate.id === id)
    return tab ? saveDocument(tab.documentId) : Promise.resolve<DocumentSaveStatus>('failed')
  }, [saveDocument, tabs])

  const saveActiveDocument = useCallback(async (): Promise<DocumentSaveStatus> => {
    return activeDocument ? saveDocument(activeDocument.id) : 'failed'
  }, [activeDocument, saveDocument])

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
    const exported = await documentService.exportDocx(activeDocument, outputPath, referenceDocx)
    if (!exported.ok) setDocumentError(exported.error)
  }, [activeDocument, documentService])

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
    setResourceSuggestion(opened.value.resourceSuggestion ?? null)
    dismissExternalChange(documentId)
  }, [dismissExternalChange, documentService, externalChanges])

  const dismissResourceSuggestion = useCallback(() => setResourceSuggestion(null), [])
  const dismissDocumentError = useCallback(() => setDocumentError(null), [])
  const dismissRecoveryState = useCallback((documentId?: string) => {
    if (documentId) clearRecovery(documentId)
    else if (activeDocument) clearRecovery(activeDocument.id)
  }, [activeDocument, clearRecovery])

  const updateActiveSecurityPolicy = useCallback((update: (policy: PackageSecurityPolicy) => PackageSecurityPolicy) => {
    if (!activeDocument) return
    setSecurityPolicies(previous => ({
      ...previous,
      [activeDocument.id]: update(previous[activeDocument.id] ?? PackageSecurityPolicy.default()),
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
    resourceSuggestion,
    documentError,
    recoveryState,
    activeExternalChange,
    activeSecurityPolicy,
    createNewDocument,
    switchDocumentTab,
    closeDocumentTab,
    clearActiveDocument,
    setActiveMarkdown,
    getDocumentForTab,
    openFileFromPath,
    saveDocumentTab,
    saveActiveDocument,
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
  }), [
    documentTabs,
    activeTabId,
    activeDocument,
    activeSaveDecision,
    resourceSuggestion,
    documentError,
    recoveryState,
    activeExternalChange,
    activeSecurityPolicy,
    createNewDocument,
    switchDocumentTab,
    closeDocumentTab,
    clearActiveDocument,
    setActiveMarkdown,
    getDocumentForTab,
    openFileFromPath,
    saveDocumentTab,
    saveActiveDocument,
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
  ])

  return <DocumentContext.Provider value={value}>{children}</DocumentContext.Provider>
}

export function useDocument() {
  const context = useContext(DocumentContext)
  if (!context) throw new Error('useDocument must be used within DocumentProvider')
  return context
}
