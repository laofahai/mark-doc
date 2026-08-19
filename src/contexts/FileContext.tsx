import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { readTextFile, watch } from '@tauri-apps/plugin-fs'
import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

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

/** 外部修改提示信息 */
export interface ExternalChange {
  tabId: string
  path: string
  name: string
}

interface FileContextValue {
  tabs: FileTab[]
  activeTabId: string | null
  activeTab: FileTab | null
  recentFiles: RecentFile[]
  externalChange: ExternalChange | null
  setTabContent: (content: string) => void
  markTabSaved: (id: string, path?: string, name?: string, sourceType?: 'md' | 'docx') => void
  openFileFromPath: (path: string, name: string) => Promise<void>
  openFileDialog: () => Promise<void>
  createNewTab: () => void
  closeTab: (id: string) => void
  switchTab: (id: string) => void
  clearActiveTab: () => void
  reloadTab: (tabId: string) => Promise<void>
  dismissExternalChange: () => void
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
  const [externalChange, setExternalChange] = useState<ExternalChange | null>(null)
  // 记录我们自己保存的时间戳，避免自己保存时触发外部变化提示
  const selfSaveTimestamps = useRef<Map<string, number>>(new Map())

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
      const finalPath = path !== undefined ? path : t.path
      // 记录保存时间戳，2秒内忽略该文件的外部变化
      if (finalPath) selfSaveTimestamps.current.set(finalPath, Date.now())
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
    const name = 'untitled.md'
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
      // 通知侧边栏展示文件所在目录
      window.dispatchEvent(new CustomEvent('mark-doc:file-opened', { detail: path }))
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

  const clearActiveTab = useCallback(() => {
    setActiveTabId(null)
  }, [])

  const reloadTab = useCallback(async (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId)
    if (!tab || !tab.path) return
    try {
      const isDocx = tab.path.toLowerCase().endsWith('.docx')
      const content = isDocx ? await docxToMarkdown(tab.path) : await readTextFile(tab.path)
      setTabs(prev => prev.map(t => t.id === tabId ? { ...t, content, isDirty: false } : t))
    } catch (e) {
      console.error('Failed to reload file:', e)
    }
    setExternalChange(null)
  }, [tabs])

  const dismissExternalChange = useCallback(() => {
    setExternalChange(null)
  }, [])

  // 监听已打开文件的外部变化
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  useEffect(() => {
    const unwatchers: (() => void)[] = []
    const paths = tabs.filter(t => t.path).map(t => ({ id: t.id, path: t.path, name: t.name }))

    for (const { id, path, name } of paths) {
      watch(path, () => {
        // 忽略自己保存触发的变化（2秒窗口）
        const saveTime = selfSaveTimestamps.current.get(path)
        if (saveTime && Date.now() - saveTime < 2000) return
        setExternalChange({ tabId: id, path, name })
      }, { delayMs: 500 }).then(unwatch => {
        unwatchers.push(unwatch)
      }).catch(() => {})
    }

    return () => { unwatchers.forEach(fn => fn()) }
  }, [tabs.map(t => t.path).join('|')])

  // 监听系统文件关联打开事件
  const openFileFromPathRef = useRef(openFileFromPath)
  openFileFromPathRef.current = openFileFromPath
  useEffect(() => {
    // 查询冷启动时缓存的文件路径
    invoke<string[]>('take_pending_files').then((paths) => {
      for (const path of paths) {
        const name = path.split('/').pop() || 'untitled'
        openFileFromPathRef.current(path, name)
      }
    }).catch(() => {})

    // 监听后续的文件打开事件（应用已运行时）
    const unlisten = listen<string[]>('open-files', (event) => {
      for (const path of event.payload) {
        const name = path.split('/').pop() || 'untitled'
        openFileFromPathRef.current(path, name)
      }
    })
    return () => { unlisten.then(fn => fn()) }
  }, [])

  const openFileDialog = useCallback(async () => {
    // 默认打开当前文件所在目录
    const currentDir = activeTab?.path
      ? activeTab.path.substring(0, activeTab.path.lastIndexOf('/'))
      : undefined
    const filePath = await open({
      defaultPath: currentDir,
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'Word', extensions: ['docx'] },
      ],
    })
    if (filePath) {
      const name = (filePath as string).split('/').pop() || 'untitled.md'
      await openFileFromPath(filePath as string, name)
    }
  }, [openFileFromPath, activeTab?.path])

  return (
    <FileContext.Provider value={{
      tabs,
      activeTabId,
      activeTab,
      recentFiles,
      externalChange,
      setTabContent,
      markTabSaved,
      openFileFromPath,
      openFileDialog,
      createNewTab,
      closeTab,
      switchTab,
      clearActiveTab,
      reloadTab,
      dismissExternalChange,
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
