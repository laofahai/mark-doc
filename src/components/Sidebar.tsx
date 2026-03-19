import { useState, useEffect, useCallback, useRef } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { readDir, watch } from '@tauri-apps/plugin-fs'
import { useTranslation } from 'react-i18next'
import { useFile } from '../contexts/FileContext'
import {
  FolderOpen,
  FolderClosed,
  FileText,
  ChevronRight,
  ArrowUp,
  ArrowDownRight,
  X as XIcon,
} from 'lucide-react'

interface FileNode {
  name: string
  path: string
  type: 'file' | 'folder'
  children?: FileNode[]
}

interface SidebarProps {
  onFolderStateChange?: (hasFolder: boolean) => void
}

const LAST_FOLDER_KEY = 'mark-doc-last-folder'

export function Sidebar({ onFolderStateChange }: SidebarProps) {
  const { t } = useTranslation()
  const { activeTab, openFileFromPath } = useFile()
  const [currentFolder, setCurrentFolder] = useState<string | null>(null)
  const [folderTree, setFolderTree] = useState<FileNode[]>([])
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const unwatchRef = useRef<(() => void) | null>(null)
  const initializedRef = useRef(false)

  useEffect(() => {
    const handler = () => handleOpenFolder()
    window.addEventListener('mark-doc:open-folder', handler)
    return () => window.removeEventListener('mark-doc:open-folder', handler)
  }, [])

  useEffect(() => {
    onFolderStateChange?.(!!currentFolder)
  }, [currentFolder, onFolderStateChange])

  const buildFileNodes = useCallback(async (path: string): Promise<FileNode[]> => {
    const entries = await readDir(path)
    const nodes: FileNode[] = []
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      if (entry.isDirectory) {
        nodes.push({ name: entry.name, path: `${path}/${entry.name}`, type: 'folder', children: [] })
      } else if (entry.name.endsWith('.md') || entry.name.endsWith('.docx')) {
        nodes.push({ name: entry.name, path: `${path}/${entry.name}`, type: 'file' })
      }
    }
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return nodes
  }, [])

  const refreshFolder = useCallback(async (path: string) => {
    try { setFolderTree(await buildFileNodes(path)) }
    catch (error) { console.error('Failed to load folder:', error) }
  }, [buildFileNodes])

  // 监听文件打开事件，自动展示文件所在目录
  useEffect(() => {
    const openFileHandler = (e: Event) => {
      const filePath = (e as CustomEvent<string>).detail
      if (!filePath) return
      const dir = filePath.substring(0, filePath.lastIndexOf('/'))
      if (dir && dir !== currentFolder) {
        setCurrentFolder(dir)
        localStorage.setItem(LAST_FOLDER_KEY, dir)
        refreshFolder(dir)
      }
    }
    window.addEventListener('mark-doc:file-opened', openFileHandler)
    return () => window.removeEventListener('mark-doc:file-opened', openFileHandler)
  }, [currentFolder, refreshFolder])

  // 恢复上次打开的目录
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true
    const last = localStorage.getItem(LAST_FOLDER_KEY)
    if (last) {
      setCurrentFolder(last)
      refreshFolder(last)
    }
  }, [refreshFolder])

  // 监控文件夹变化
  useEffect(() => {
    if (!currentFolder) return
    let cancelled = false

    const startWatch = async () => {
      try {
        const unwatch = await watch(currentFolder, () => {
          if (!cancelled) refreshFolder(currentFolder)
        }, { recursive: true, delayMs: 500 })
        if (cancelled) {
          unwatch()
        } else {
          unwatchRef.current = unwatch
        }
      } catch (err) {
        console.error('Failed to watch folder:', err)
      }
    }

    startWatch()

    return () => {
      cancelled = true
      unwatchRef.current?.()
      unwatchRef.current = null
    }
  }, [currentFolder, refreshFolder])

  const handleOpenFolder = async () => {
    const folderPath = await open({ directory: true, multiple: false })
    if (folderPath) {
      setCurrentFolder(folderPath as string)
      localStorage.setItem(LAST_FOLDER_KEY, folderPath as string)
      await refreshFolder(folderPath as string)
    }
  }

  const closeFolder = () => {
    setCurrentFolder(null)
    setFolderTree([])
    setExpandedFolders(new Set())
    localStorage.removeItem(LAST_FOLDER_KEY)
  }

  const goToParent = async () => {
    if (!currentFolder) return
    const parent = currentFolder.substring(0, currentFolder.lastIndexOf('/'))
    if (!parent) return
    setCurrentFolder(parent)
    localStorage.setItem(LAST_FOLDER_KEY, parent)
    setExpandedFolders(new Set())
    await refreshFolder(parent)
  }

  const drillInto = async (folderPath: string) => {
    setCurrentFolder(folderPath)
    localStorage.setItem(LAST_FOLDER_KEY, folderPath)
    setExpandedFolders(new Set())
    await refreshFolder(folderPath)
  }

  const toggleFolder = async (node: FileNode) => {
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(node.path)) {
      newExpanded.delete(node.path)
    } else {
      if (!node.children || node.children.length === 0) {
        try {
          node.children = await buildFileNodes(node.path)
          setFolderTree([...folderTree])
        } catch (error) { console.error('Failed to load folder children:', error) }
      }
      newExpanded.add(node.path)
    }
    setExpandedFolders(newExpanded)
  }

  const renderTree = (nodes: FileNode[], level = 0) => {
    const isActive = (path: string) => activeTab?.path === path
    return nodes.map(node => (
      <div key={node.path}>
        <div
          className={`group/node flex items-center h-7 px-1.5 cursor-pointer rounded-md mx-1 text-[12px] transition-colors ${
            isActive(node.path) ? 'bg-accent text-accent-foreground font-medium' : 'text-foreground/80 hover:bg-accent/50'
          }`}
          style={{ paddingLeft: `${level * 14 + 4}px` }}
          onClick={() => node.type === 'folder' ? toggleFolder(node) : openFileFromPath(node.path, node.name)}
        >
          <span className={`flex items-center gap-px mr-1.5 shrink-0 ${isActive(node.path) ? 'text-accent-foreground' : 'text-muted-foreground'}`}>
            {node.type === 'folder' ? (
              <>
                <ChevronRight size={14} className={`transition-transform ${expandedFolders.has(node.path) ? 'rotate-90' : ''}`} />
                {expandedFolders.has(node.path) ? <FolderOpen size={14} /> : <FolderClosed size={14} />}
              </>
            ) : (
              <><span className="w-3.5" /><FileText size={14} /></>
            )}
          </span>
          <span className="truncate flex-1">{node.name}</span>
          {node.type === 'folder' && (
            <button
              className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent opacity-0 group-hover/node:opacity-100 cursor-pointer border-none bg-transparent flex items-center shrink-0"
              onClick={(e) => { e.stopPropagation(); drillInto(node.path) }}
              title={t('common.drillInto')}
            >
              <ArrowDownRight size={12} />
            </button>
          )}
        </div>
        {node.type === 'folder' && expandedFolders.has(node.path) && node.children && renderTree(node.children, level + 1)}
      </div>
    ))
  }

  if (!currentFolder) return null

  return (
    <div className="flex flex-col flex-1 overflow-hidden pt-2">
      <div className="flex items-center justify-between px-2 py-1">
        <div className="flex items-center gap-0.5 min-w-0 flex-1">
          <button
            className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer border-none bg-transparent flex items-center shrink-0"
            onClick={goToParent}
            title={t('common.parentFolder')}
          >
            <ArrowUp size={12} />
          </button>
          <span className="text-[11px] font-medium text-muted-foreground truncate">{currentFolder.split('/').pop()}</span>
        </div>
        <button
          className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer border-none bg-transparent flex items-center shrink-0"
          onClick={closeFolder}
          title={t('common.closeFolder')}
        >
          <XIcon size={12} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {renderTree(folderTree)}
      </div>
    </div>
  )
}
