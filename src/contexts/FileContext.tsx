import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { readTextFile } from '@tauri-apps/plugin-fs'
import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'

export interface FileTab {
  id: string
  path: string
  name: string
  sourceType: 'md' | 'docx'
  content: string
  isDirty: boolean
  /** 打开 docx 时记录原文件路径，保存时作为 --reference-doc 使用 */
  referenceDocxPath?: string
}

export interface RecentFile {
  path: string
  name: string
  lastOpened: number
}

interface FileContextValue {
  tabs: FileTab[]
  activeTabId: string | null
  activeTab: FileTab | null
  recentFiles: RecentFile[]
  setTabContent: (content: string) => void
  markTabSaved: (id: string, path?: string, name?: string, sourceType?: 'md' | 'docx') => void
  openFileFromPath: (path: string, name: string) => Promise<void>
  openFileDialog: () => Promise<void>
  createNewTab: () => void
  closeTab: (id: string) => void
  switchTab: (id: string) => void
  removeRecentFile: (path: string) => void
  clearRecentFiles: () => void
}

const RECENT_KEY = 'mark-doc-recent-files'
let tabIdCounter = 0
function nextTabId() { return `tab-${++tabIdCounter}` }

function loadRecent(): RecentFile[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') }
  catch { return [] }
}
function saveRecent(files: RecentFile[]) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(files))
}

/** docx -> markdown（一步到位，通过 Pandoc 直接转换） */
async function docxToMarkdown(inputPath: string): Promise<string> {
  const result = await invoke<{ success: boolean; content?: string; error?: string }>('pandoc_docx_to_markdown', {
    inputPath,
  })
  if (result.success && result.content) {
    return result.content
  }
  throw new Error(result.error || 'Conversion failed')
}

const FileContext = createContext<FileContextValue | null>(null)

export function FileProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<FileTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(loadRecent)

  const activeTab = tabs.find(t => t.id === activeTabId) || null

  const addToRecent = useCallback((path: string, name: string) => {
    setRecentFiles(prev => {
      const next = prev.filter(f => f.path !== path).slice(0, 9)
      next.unshift({ path, name, lastOpened: Date.now() })
      saveRecent(next)
      return next
    })
  }, [])

  const removeRecentFile = useCallback((path: string) => {
    setRecentFiles(prev => {
      const next = prev.filter(f => f.path !== path)
      saveRecent(next)
      return next
    })
  }, [])

  const clearRecentFiles = useCallback(() => {
    setRecentFiles([])
    saveRecent([])
  }, [])

  const setTabContent = useCallback((content: string) => {
    setTabs(prev => prev.map(t =>
      t.id === activeTabId ? { ...t, content, isDirty: true } : t
    ))
  }, [activeTabId])

  const markTabSaved = useCallback((id: string, path?: string, name?: string, sourceType?: 'md' | 'docx') => {
    setTabs(prev => prev.map(t => {
      if (t.id !== id) return t
      return {
        ...t,
        isDirty: false,
        ...(path !== undefined && { path }),
        ...(name !== undefined && { name }),
        ...(sourceType !== undefined && { sourceType }),
      }
    }))
    if (path) addToRecent(path, name || path.split('/').pop() || '')
  }, [addToRecent])

  const createNewTab = useCallback(() => {
    const id = nextTabId()
    const name = '未命名.md'
    setTabs(prev => [...prev, {
      id,
      path: '',
      name,
      sourceType: 'md',
      content: '',
      isDirty: false,
    }])
    setActiveTabId(id)
  }, [])

  const openFileFromPath = useCallback(async (path: string, name: string) => {
    // 如果已打开，直接切换
    const existing = tabs.find(t => t.path === path)
    if (existing) {
      setActiveTabId(existing.id)
      return
    }

    try {
      const isDocx = path.toLowerCase().endsWith('.docx')
      let markdown: string

      if (isDocx) {
        markdown = await docxToMarkdown(path)
      } else {
        markdown = await readTextFile(path)
      }

      const id = nextTabId()
      setTabs(prev => [...prev, {
        id,
        path,
        name,
        sourceType: isDocx ? 'docx' : 'md',
        content: markdown,
        isDirty: false,
        // docx 文件：原文件自身作为 reference，保存时保留原样式
        referenceDocxPath: isDocx ? path : undefined,
      }])
      setActiveTabId(id)
      addToRecent(path, name)
    } catch (error) {
      console.error('Failed to open file:', error)
    }
  }, [tabs, addToRecent])

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === id)
      const next = prev.filter(t => t.id !== id)
      if (id === activeTabId && next.length > 0) {
        setActiveTabId(next[Math.min(idx, next.length - 1)].id)
      } else if (next.length === 0) {
        setActiveTabId(null)
      }
      return next
    })
  }, [activeTabId])

  const switchTab = useCallback((id: string) => {
    setActiveTabId(id)
  }, [])

  const openFileDialog = useCallback(async () => {
    const filePath = await open({
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'Word', extensions: ['docx'] },
      ],
    })
    if (filePath) {
      const name = (filePath as string).split('/').pop() || 'untitled.md'
      await openFileFromPath(filePath as string, name)
    }
  }, [openFileFromPath])

  return (
    <FileContext.Provider value={{
      tabs,
      activeTabId,
      activeTab,
      recentFiles,
      setTabContent,
      markTabSaved,
      openFileFromPath,
      openFileDialog,
      createNewTab,
      closeTab,
      switchTab,
      removeRecentFile,
      clearRecentFiles,
    }}>
      {children}
    </FileContext.Provider>
  )
}

export function useFile() {
  const ctx = useContext(FileContext)
  if (!ctx) throw new Error('useFile must be used within FileProvider')
  return ctx
}
