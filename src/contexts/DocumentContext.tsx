import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { DocumentModel } from '../services/document/model'
import { resolveSaveTarget, type SaveTargetDecision } from '../services/document/save-strategy'

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
  createNewDocument: () => void
  switchDocumentTab: (id: string) => void
  closeDocumentTab: (id: string) => void
  clearActiveDocument: () => void
  setActiveMarkdown: (markdown: string) => void
  getDocumentForTab: (id: string) => DocumentModel | null
  markDocumentTabSavedAsMarkdown: (id: string, path: string) => void
  markActiveDocumentSavedAsMarkdown: (path: string) => void
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

  const value = useMemo(() => ({
    tabs: documentTabs,
    activeTabId,
    activeDocument,
    activeSaveDecision,
    createNewDocument,
    switchDocumentTab,
    closeDocumentTab,
    clearActiveDocument,
    setActiveMarkdown,
    getDocumentForTab,
    markDocumentTabSavedAsMarkdown,
    markActiveDocumentSavedAsMarkdown,
  }), [
    documentTabs,
    activeTabId,
    activeDocument,
    activeSaveDecision,
    createNewDocument,
    switchDocumentTab,
    closeDocumentTab,
    clearActiveDocument,
    setActiveMarkdown,
    getDocumentForTab,
    markDocumentTabSavedAsMarkdown,
    markActiveDocumentSavedAsMarkdown,
  ])

  return <DocumentContext.Provider value={value}>{children}</DocumentContext.Provider>
}

export function useDocument() {
  const context = useContext(DocumentContext)
  if (!context) throw new Error('useDocument must be used within DocumentProvider')
  return context
}
