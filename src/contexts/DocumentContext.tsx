import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { DocumentModel } from '../services/document/model'
import { resolveSaveTarget, type SaveTargetDecision } from '../services/document/save-strategy'
import { DocumentService } from '../services/document/document-service'
import type { DocumentError } from '../services/document/errors'
import type { OpenDocumentResult } from '../services/document/document-service'

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
  exportActiveDocx: (outputPath: string, referenceDocx?: string) => Promise<void>
  dismissResourceSuggestion: () => void
  dismissDocumentError: () => void
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
  const documentService = useMemo(() => new DocumentService(), [])

  const activeTab = tabs.find(tab => tab.id === activeTabId) || null
  const activeDocument = documents.find(document => document.id === activeTab?.documentId) || null
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

  const saveActiveDocument = useCallback(async () => {
    if (!activeDocument) return
    const saved = await documentService.saveDocument(activeDocument)
    if (!saved.ok) {
      setDocumentError(saved.error)
      return
    }
    if (!saved.value) return
    setDocuments(previous => previous.map(document => document.id === activeDocument.id ? saved.value! : document))
    const path = saved.value.source.type === 'markdown' ? saved.value.source.path
      : saved.value.source.type === 'package' ? saved.value.source.packagePath
        : null
    if (path && activeTabId) {
      setTabs(previous => previous.map(tab => tab.id === activeTabId
        ? { ...tab, name: path.split('/').pop() || tab.name }
        : tab
      ))
    }
  }, [activeDocument, activeTabId, documentService])

  const exportActiveDocx = useCallback(async (outputPath: string, referenceDocx?: string) => {
    if (!activeDocument) return
    const exported = await documentService.exportDocx(activeDocument, outputPath, referenceDocx)
    if (!exported.ok) setDocumentError(exported.error)
  }, [activeDocument, documentService])

  const dismissResourceSuggestion = useCallback(() => setResourceSuggestion(null), [])
  const dismissDocumentError = useCallback(() => setDocumentError(null), [])

  const value = useMemo(() => ({
    tabs: documentTabs,
    activeTabId,
    activeDocument,
    activeSaveDecision,
    resourceSuggestion,
    documentError,
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
    exportActiveDocx,
    dismissResourceSuggestion,
    dismissDocumentError,
  }), [
    documentTabs,
    activeTabId,
    activeDocument,
    activeSaveDecision,
    resourceSuggestion,
    documentError,
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
    exportActiveDocx,
    dismissResourceSuggestion,
    dismissDocumentError,
  ])

  return <DocumentContext.Provider value={value}>{children}</DocumentContext.Provider>
}

export function useDocument() {
  const context = useContext(DocumentContext)
  if (!context) throw new Error('useDocument must be used within DocumentProvider')
  return context
}
