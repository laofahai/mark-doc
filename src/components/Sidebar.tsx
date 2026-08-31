import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { watch } from '@tauri-apps/plugin-fs'
import { useTranslation } from 'react-i18next'
import { useDocument } from '../contexts/DocumentContext'
import { documentSourcePath } from '../services/document/external-change-service'
import { readDir, selectDocumentFolder } from '../services/native-file'
import {
  FolderOpen,
  FolderClosed,
  FolderTree,
  ListTree,
  ListCollapse,
  ListChevronsUpDown,
  ChevronRight,
  ArrowUp,
  ArrowDownRight,
  X as XIcon,
} from 'lucide-react'
import { getSidebarFileDisplay, type SidebarFileDisplay } from './sidebar-file-display'
import { SidebarDocumentIcon } from './sidebar-document-icons'
import { getSidebarOutline, type SidebarOutlineItem } from './sidebar-outline'

interface FileNode {
  name: string
  path: string
  type: 'file' | 'folder'
  children?: FileNode[]
}

interface SidebarProps {
  onSidebarStateChange?: (hasSidebarContent: boolean) => void
}

type SidebarMode = 'outline' | 'files'

const LAST_FOLDER_KEY = 'mark-doc-last-folder'
const modeButtonClass = [
  'inline-flex h-6 w-6 items-center justify-center rounded-md border-none bg-transparent',
  'text-muted-foreground cursor-pointer transition-colors hover:bg-accent hover:text-foreground',
  'aria-pressed:bg-accent aria-pressed:text-foreground disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent',
].join(' ')
const iconButtonClass = [
  'p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent',
  'cursor-pointer border-none bg-transparent flex items-center shrink-0',
].join(' ')

function SidebarFileIcon({ display }: { display: SidebarFileDisplay }) {
  return (
    <SidebarDocumentIcon
      ariaLabel={display.ariaLabel}
      className={display.iconClassName}
      kind={display.kind}
      size={14}
    />
  )
}

function outlineHeadingSelector() {
  return [
    '.editor-vditor-surface .vditor-reset h1',
    '.editor-vditor-surface .vditor-reset h2',
    '.editor-vditor-surface .vditor-reset h3',
    '.editor-vditor-surface .vditor-reset h4',
    '.editor-vditor-surface .vditor-reset h5',
    '.editor-vditor-surface .vditor-reset h6',
  ].join(',')
}

function hasOutlineChildren(items: SidebarOutlineItem[], index: number) {
  const level = items[index].level
  for (let i = index + 1; i < items.length; i += 1) {
    if (items[i].level <= level) return false
    if (items[i].level > level) return true
  }
  return false
}

function isOutlineItemHidden(items: SidebarOutlineItem[], index: number, collapsedIds: Set<string>) {
  let level = items[index].level
  for (let i = index - 1; i >= 0; i -= 1) {
    if (items[i].level >= level) continue
    if (collapsedIds.has(items[i].id)) return true
    level = items[i].level
  }
  return false
}

export function Sidebar({ onSidebarStateChange }: SidebarProps) {
  const { t } = useTranslation()
  const documentContext = useDocument()
  const activeDocument = documentContext.activeDocument
  const activeDocumentPath = activeDocument ? documentSourcePath(activeDocument) : null
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('outline')
  const [currentFolder, setCurrentFolder] = useState<string | null>(null)
  const [folderTree, setFolderTree] = useState<FileNode[]>([])
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [collapsedOutlineIds, setCollapsedOutlineIds] = useState<Set<string>>(new Set())
  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(null)
  const unwatchRef = useRef<(() => void) | null>(null)
  const outlineItems = useMemo(() => getSidebarOutline(activeDocument?.markdown ?? ''), [activeDocument?.markdown])
  const outlineItemIds = useMemo(() => new Set(outlineItems.map(item => item.id)), [outlineItems])
  const collapsibleOutlineIds = useMemo(
    () => outlineItems.filter((_, index) => hasOutlineChildren(outlineItems, index)).map(item => item.id),
    [outlineItems],
  )
  const hasSidebarContent = Boolean(activeDocument || currentFolder)
  const effectiveMode: SidebarMode = activeDocument ? sidebarMode : 'files'
  const allOutlineCollapsed = collapsibleOutlineIds.length > 0 && collapsibleOutlineIds.every(id => collapsedOutlineIds.has(id))

  const buildFileNodes = useCallback(async (path: string): Promise<FileNode[]> => {
    const entries = await readDir(path)
    const nodes: FileNode[] = []
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      if (entry.isDirectory) {
        nodes.push({ name: entry.name, path: `${path}/${entry.name}`, type: 'folder', children: [] })
      } else if (/\.(md|mdoc|docx|doc|txt)$/i.test(entry.name)) {
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

  const handleOpenFolder = useCallback(async () => {
    const folderPath = await selectDocumentFolder()
    if (folderPath) {
      setSidebarMode('files')
      setCurrentFolder(folderPath)
      localStorage.setItem(LAST_FOLDER_KEY, folderPath)
      await refreshFolder(folderPath)
    }
  }, [refreshFolder])

  useEffect(() => {
    const handler = () => { void handleOpenFolder() }
    window.addEventListener('mark-doc:open-folder', handler)
    return () => window.removeEventListener('mark-doc:open-folder', handler)
  }, [handleOpenFolder])

  useEffect(() => {
    onSidebarStateChange?.(hasSidebarContent)
  }, [hasSidebarContent, onSidebarStateChange])

  useEffect(() => {
    setCollapsedOutlineIds(previous => new Set([...previous].filter(id => outlineItemIds.has(id))))
    setActiveOutlineId(previous => previous && outlineItemIds.has(previous) ? previous : null)
  }, [outlineItemIds])

  // 监听文件打开事件，记录文件所在目录，但默认视图仍然保持大纲。
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

  const closeFolder = () => {
    setCurrentFolder(null)
    setFolderTree([])
    setExpandedFolders(new Set())
    localStorage.removeItem(LAST_FOLDER_KEY)
    if (activeDocument) setSidebarMode('outline')
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

  const focusOutlineItem = (item: SidebarOutlineItem) => {
    setActiveOutlineId(item.id)
    const headings = Array.from(document.querySelectorAll<HTMLElement>(outlineHeadingSelector()))
    const target = headings[item.index] ?? headings.find(element => element.textContent?.trim() === item.text)
    target?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  const toggleOutlineItem = (id: string) => {
    setCollapsedOutlineIds(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllOutlineItems = () => {
    setCollapsedOutlineIds(allOutlineCollapsed ? new Set() : new Set(collapsibleOutlineIds))
  }

  const renderTree = (nodes: FileNode[], level = 0) => {
    const isActive = (path: string) => activeDocumentPath === path
    return nodes.map(node => {
      const fileDisplay = node.type === 'file' ? getSidebarFileDisplay(node.name) : null
      return (
        <div key={node.path}>
          <div
            className={`group/node flex items-center h-7 px-1.5 cursor-pointer rounded-md mx-1 text-[12px] transition-colors ${
              isActive(node.path) ? 'bg-accent text-accent-foreground font-medium' : 'text-foreground/80 hover:bg-accent/50'
            }`}
            style={{ paddingLeft: `${level * 14 + 4}px` }}
            onClick={() => {
              if (node.type === 'folder') {
                void toggleFolder(node)
                return
              }
              void documentContext.openFileFromPath(node.path, node.name)
            }}
          >
            <span className={`flex items-center gap-px mr-1.5 shrink-0 ${isActive(node.path) ? 'text-accent-foreground' : 'text-muted-foreground'}`}>
              {node.type === 'folder' ? (
                <>
                  <ChevronRight size={14} className={`transition-transform ${expandedFolders.has(node.path) ? 'rotate-90' : ''}`} />
                  {expandedFolders.has(node.path) ? <FolderOpen size={14} /> : <FolderClosed size={14} />}
                </>
              ) : (
                <><span className="w-3.5" />{fileDisplay && <SidebarFileIcon display={fileDisplay} />}</>
              )}
            </span>
            <span className="truncate flex-1" title={node.name}>{fileDisplay?.label ?? node.name}</span>
            {node.type === 'folder' && (
              <button
                className={iconButtonClass + ' opacity-0 group-hover/node:opacity-100'}
                aria-label={t('common.drillInto')}
                title={t('common.drillInto')}
                onClick={(e) => { e.stopPropagation(); drillInto(node.path) }}
              >
                <ArrowDownRight size={12} />
              </button>
            )}
          </div>
          {node.type === 'folder' && expandedFolders.has(node.path) && node.children && renderTree(node.children, level + 1)}
        </div>
      )
    })
  }

  const renderOutline = () => {
    if (outlineItems.length === 0) {
      return <div className="px-3 py-5 text-[12px] text-muted-foreground/60">{t('sidebar.noOutline')}</div>
    }
    return outlineItems.map((item, index) => {
      if (isOutlineItemHidden(outlineItems, index, collapsedOutlineIds)) return null
      const hasChildren = hasOutlineChildren(outlineItems, index)
      const collapsed = collapsedOutlineIds.has(item.id)
      const active = activeOutlineId === item.id
      return (
        <div
          key={item.id}
          className={`mx-1 flex h-7 items-center rounded-md text-[12px] font-normal transition-colors ${
            active ? 'bg-accent text-foreground font-semibold' : 'text-foreground/80 hover:bg-accent/50 hover:text-foreground'
          }`}
          style={{ paddingLeft: `${Math.max(0, item.level - 1) * 12 + 4}px` }}
        >
          {hasChildren ? (
            <button
              type="button"
              className="inline-flex h-6 w-5 shrink-0 items-center justify-center rounded border-none bg-transparent p-0 text-muted-foreground hover:text-foreground cursor-pointer"
              aria-label={`${t(collapsed ? 'sidebar.expandHeading' : 'sidebar.collapseHeading')}: ${item.text}`}
              title={t(collapsed ? 'sidebar.expandHeading' : 'sidebar.collapseHeading')}
              onClick={() => toggleOutlineItem(item.id)}
            >
              <ChevronRight size={13} className={`transition-transform ${collapsed ? '' : 'rotate-90'}`} />
            </button>
          ) : (
            <span className="h-6 w-5 shrink-0" />
          )}
          <button
            type="button"
            className={`min-w-0 flex-1 truncate border-none bg-transparent px-1.5 py-0 text-left text-[12px] text-current cursor-pointer ${active ? 'font-semibold' : 'font-normal'}`}
            aria-current={active ? 'true' : undefined}
            title={item.text}
            onClick={() => focusOutlineItem(item)}
          >
            {item.text}
          </button>
        </div>
      )
    })
  }

  const renderFiles = () => {
    if (!currentFolder) {
      return (
        <div className="flex flex-1 items-center justify-center px-3">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-2.5 py-1.5 text-[12px] text-foreground hover:bg-accent cursor-pointer"
            aria-label={t('sidebar.openFolder')}
            onClick={() => void handleOpenFolder()}
          >
            <FolderOpen size={14} />
            <span>{t('sidebar.openFolder')}</span>
          </button>
        </div>
      )
    }
    return renderTree(folderTree)
  }

  if (!hasSidebarContent) return null

  return (
    <div className="flex flex-col flex-1 overflow-hidden pt-2" data-markdoc-sidebar-content>
      <div className="flex items-center justify-between gap-1 px-2 py-1">
        <div className="inline-flex items-center gap-0.5 rounded-md bg-muted/35 p-0.5">
          <button
            type="button"
            className={modeButtonClass}
            aria-label={t('sidebar.outline')}
            aria-pressed={effectiveMode === 'outline'}
            title={t('sidebar.outline')}
            disabled={!activeDocument}
            onClick={() => setSidebarMode('outline')}
          >
            <ListTree size={13} />
          </button>
          <button
            type="button"
            className={modeButtonClass}
            aria-label={t('sidebar.files')}
            aria-pressed={effectiveMode === 'files'}
            title={t('sidebar.files')}
            onClick={() => setSidebarMode('files')}
          >
            <FolderTree size={13} />
          </button>
        </div>
        <div className="min-w-0 flex-1 truncate text-[11px] font-medium text-muted-foreground">
          {effectiveMode === 'outline' ? (
            collapsibleOutlineIds.length > 0 && (
              <button
                type="button"
                className="ml-auto flex h-6 items-center justify-center rounded-md border-none bg-transparent px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
                aria-label={t(allOutlineCollapsed ? 'sidebar.expandAll' : 'sidebar.collapseAll')}
                title={t(allOutlineCollapsed ? 'sidebar.expandAll' : 'sidebar.collapseAll')}
                onClick={toggleAllOutlineItems}
              >
                {allOutlineCollapsed ? <ListChevronsUpDown size={13} /> : <ListCollapse size={13} />}
              </button>
            )
          ) : currentFolder?.split('/').pop() ?? t('sidebar.files')}
        </div>
        {effectiveMode === 'files' && currentFolder && (
          <div className="flex items-center gap-0.5">
            <button
              className={iconButtonClass}
              aria-label={t('common.parentFolder')}
              onClick={goToParent}
              title={t('common.parentFolder')}
            >
              <ArrowUp size={12} />
            </button>
            <button
              className={iconButtonClass}
              aria-label={t('common.closeFolder')}
              onClick={closeFolder}
              title={t('common.closeFolder')}
            >
              <XIcon size={12} />
            </button>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {effectiveMode === 'outline' ? renderOutline() : renderFiles()}
      </div>
    </div>
  )
}
