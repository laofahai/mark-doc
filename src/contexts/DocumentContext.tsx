import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { DocumentModel } from '../services/document/model'
import { resolveSaveTarget, type SaveTargetDecision } from '../services/document/save-strategy'

interface DocumentTab {
  id: string
  documentId: string
  name: string
}

interface DocumentContextValue {
  tabs: DocumentTab[]
  activeTabId: string | null
  activeDocument: DocumentModel | null
  activeSaveDecision: SaveTargetDecision | null
  createNewDocument: () => void
  setActiveMarkdown: (markdown: string) => void
}

const DocumentContext = createContext<DocumentContextValue | null>(null)
let documentCounter = 0

function nextId() {
  documentCounter += 1
  return `document-${documentCounter}`
}

export function DocumentProvider({ children }: { children: ReactNode }) {
  const [documents, setDocuments] = useState<DocumentModel[]>([])
  const [tabs, setTabs] = useState<DocumentTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  const activeTab = tabs.find(tab => tab.id === activeTabId) || null
  const activeDocument = documents.find(document => document.id === activeTab?.documentId) || null
  const activeSaveDecision = activeDocument ? resolveSaveTarget(activeDocument) : null

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

  const setActiveMarkdown = useCallback((markdown: string) => {
    if (!activeDocument) return

    setDocuments(previous => previous.map(document => document.id === activeDocument.id
      ? { ...document, markdown, dirty: { ...document.dirty, markdown: true } }
      : document
    ))
  }, [activeDocument])

  const value = useMemo(() => ({
    tabs,
    activeTabId,
    activeDocument,
    activeSaveDecision,
    createNewDocument,
    setActiveMarkdown,
  }), [tabs, activeTabId, activeDocument, activeSaveDecision, createNewDocument, setActiveMarkdown])

  return <DocumentContext.Provider value={value}>{children}</DocumentContext.Provider>
}

export function useDocument() {
  const context = useContext(DocumentContext)
  if (!context) throw new Error('useDocument must be used within DocumentProvider')
  return context
}
