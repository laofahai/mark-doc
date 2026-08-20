import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { DocumentModel } from '../services/document/model'
import { resolveSaveTarget, type SaveTargetDecision } from '../services/document/save-strategy'
import { DocumentService } from '../services/document/document-service'
import type { DocumentError } from '../services/document/errors'
import type { OpenDocumentResult } from '../services/document/document-service'
import { RecoveryService, type RecoveryState } from '../services/document/recovery-service'
import { PackageSecurityPolicy, type RemoteResourceType } from '../services/security/PackageSecurityPolicy'

export interface DocumentTab {
  id: string
  documentId: string
  name: string
  isDirty: boolean
}

type StoredDocumentTab = Omit<DocumentTab, 'isDirty'>

interface DocumentContextValue {
  tabs: DocumentTab[]
  activeTabId: string | null
  activeDocument: DocumentModel | null
  activeSaveDecision: SaveTargetDecision | null
  resourceSuggestion: OpenDocumentResult['resourceSuggestion'] | null
  documentError: DocumentError | null
  recoveryState: RecoveryState | null
  activeSecurityPolicy: PackageSecurityPolicy | null
  createNewDocument: () => void
  switchDocumentTab: (id: string) => void
  closeDocumentTab: (id: string) => void
  clearActiveDocument: () => void
  setActiveMarkdown: (markdown: string) => void
  getDocumentForTab: (id: string) => DocumentModel | null
  markDocumentTabSavedAsMarkdown: (id: string, path: string) => void
  markActiveDocumentSavedAsMarkdown: (path: string) => void
  openFileFromPath: (path: string, name: string) => Promise<void>
  saveActiveDocument: () => Promise<void>
  retryRecovery: (documentId: string) => Promise<void>
  restoreRecovery: (documentId: string) => void
  discardRecovery: (documentId: string) => void
  exportActiveDocx: (outputPath: string, referenceDocx?: string) => Promise<void>
  trustActiveDocument: () => void
  allowActiveRemoteResourceType: (type: RemoteResourceType) => void
  allowActiveRemoteDomain: (domain: string) => void
  allowActiveRemoteUrl: (url: string) => void
  dismissResourceSuggestion: () => void
  dismissDocumentError: () => void
  dismissRecoveryState: (documentId?: string) => void
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
  const documentService = useMemo(() => new DocumentService(), [])
  const recoveryService = useMemo(() => new RecoveryService(), [])

  const activeTab = tabs.find(tab => tab.id === activeTabId) || null
  const activeDocument = documents.find(document => document.id === activeTab?.documentId) || null
  const recoveryState = activeDocument ? recoveryStates[activeDocument.id] ?? null : null
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

  const markDocumentTabSavedAsMarkdown = useCallback((id: string, path: string) => {
    const tab = tabs.find(tab => tab.id === id)
    if (!tab) return

    setDocuments(previous => previous.map(document => document.id === tab.documentId
      ? {
          ...document,
          source: { type: 'markdown', path },
          dirty: { ...document.dirty, markdown: false },
        }
      : document
    ))
  }, [tabs])

  const markActiveDocumentSavedAsMarkdown = useCallback((path: string) => {
    if (!activeTabId) return
    markDocumentTabSavedAsMarkdown(activeTabId, path)
  }, [activeTabId, markDocumentTabSavedAsMarkdown])

  const openFileFromPath = useCallback(async (path: string, name: string) => {
    const existing = documents.find(document => (document.source.type === 'markdown' && document.source.path === path) || (document.source.type === 'package' && document.source.packagePath === path) || (document.source.type === 'docx' && document.source.originalPath === path))
    if (existing) {
      const tab = tabs.find(candidate => candidate.documentId === existing.id)
      if (tab) setActiveTabId(tab.id)
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
  }, [documentService, documents, tabs])

  const clearRecovery = useCallback((documentId: string) => {
    recoveryService.clear(documentId)
    setRecoveryStates(previous => {
      const remaining = { ...previous }
      delete remaining[documentId]
      return remaining
    })
  }, [recoveryService])

  const saveDocument = useCallback(async (documentId: string) => {
    const document = documents.find(candidate => candidate.id === documentId)
    if (!document) return
    const saved = await documentService.saveDocument(document)
    if (!saved.ok) {
      setDocumentError(saved.error)
      if (saved.error.code === 'save.failed') {
        const recovery = recoveryService.recordSaveFailure(document.id, {
          draftPath: document.workspace.entryPath,
          markdown: document.markdown,
          originalUnchanged: true,
          reason: 'unknown',
        })
        setRecoveryStates(previous => ({ ...previous, [document.id]: recovery }))
      }
      return
    }
    if (!saved.value) return
    clearRecovery(document.id)
    setDocuments(previous => previous.map(candidate => candidate.id === document.id ? saved.value! : candidate))
    const path = saved.value.source.type === 'markdown' ? saved.value.source.path
      : saved.value.source.type === 'package' ? saved.value.source.packagePath
        : null
    if (path) {
      setTabs(previous => previous.map(tab => tab.documentId === document.id
        ? { ...tab, name: path.split('/').pop() || tab.name }
        : tab
      ))
    }
  }, [clearRecovery, documentService, documents, recoveryService])

  const saveActiveDocument = useCallback(async () => {
    if (activeDocument) await saveDocument(activeDocument.id)
  }, [activeDocument, saveDocument])

  const retryRecovery = useCallback(async (documentId: string) => {
    await saveDocument(documentId)
  }, [saveDocument])

  const discardRecovery = useCallback((documentId: string) => {
    clearRecovery(documentId)
  }, [clearRecovery])

  const restoreRecovery = useCallback((documentId: string) => {
    const recovery = recoveryStates[documentId] ?? recoveryService.get(documentId)
    if (!recovery) return
    setDocuments(previous => previous.map(document => document.id === documentId
      ? { ...document, markdown: recovery.markdown, dirty: { ...document.dirty, markdown: true } }
      : document
    ))
    clearRecovery(documentId)
  }, [clearRecovery, recoveryService, recoveryStates])

  const exportActiveDocx = useCallback(async (outputPath: string, referenceDocx?: string) => {
    if (!activeDocument) return
    const exported = await documentService.exportDocx(activeDocument, outputPath, referenceDocx)
    if (!exported.ok) setDocumentError(exported.error)
  }, [activeDocument, documentService])

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
    activeSecurityPolicy,
    createNewDocument,
    switchDocumentTab,
    closeDocumentTab,
    clearActiveDocument,
    setActiveMarkdown,
    getDocumentForTab,
    markDocumentTabSavedAsMarkdown,
    markActiveDocumentSavedAsMarkdown,
    openFileFromPath,
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
  }), [
    documentTabs,
    activeTabId,
    activeDocument,
    activeSaveDecision,
    resourceSuggestion,
    documentError,
    recoveryState,
    activeSecurityPolicy,
    createNewDocument,
    switchDocumentTab,
    closeDocumentTab,
    clearActiveDocument,
    setActiveMarkdown,
    getDocumentForTab,
    markDocumentTabSavedAsMarkdown,
    markActiveDocumentSavedAsMarkdown,
    openFileFromPath,
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
  ])

  return <DocumentContext.Provider value={value}>{children}</DocumentContext.Provider>
}

export function useDocument() {
  const context = useContext(DocumentContext)
  if (!context) throw new Error('useDocument must be used within DocumentProvider')
  return context
}
