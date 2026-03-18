import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import Editor from '../components/Editor/Editor'
import type { EditorToolbarActions } from '../components/Editor/EditorToolbarOverlay'
import { CloseConfirmDialog } from '../components/CloseConfirmDialog'
import { ExportDocxDialog, type TemplateChoice } from '../components/ExportDocxDialog'
import { saveAsMarkdown, saveAsDocx, saveFile } from '../services/file'
import { useFile } from '../contexts/FileContext'
import { X, FileText } from 'lucide-react'

type PageWidth = 'normal' | 'wide' | 'full'
const PAGE_WIDTH_CLASS = { normal: 'max-w-[800px]', wide: 'max-w-[1100px]', full: '' }

interface Props {
  pageWidth: PageWidth
  onPageWidthChange: (w: PageWidth) => void
}

export function EditorPage({ pageWidth, onPageWidthChange }: Props) {
  const file = useFile()
  const { tabs, activeTab, activeTabId, setTabContent, markTabSaved, closeTab, switchTab, createNewTab } = file
  const [saving, setSaving] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [closeConfirm, setCloseConfirm] = useState<{ id: string; name: string } | null>(null)
  const [exportDocxOpen, setExportDocxOpen] = useState(false)
  const editorAreaRef = useRef<HTMLDivElement>(null)
  const content = activeTab?.content || ''

  const handleContentChange = useCallback((md: string) => setTabContent(md), [setTabContent])

  const handleSave = useCallback(async () => {
    if (!activeTab || !activeTabId) return
    setSaving(true)
    try {
      if (activeTab.path) {
        const ok = await saveFile(activeTab.path, content, activeTab.referenceDocxPath)
        if (ok) markTabSaved(activeTabId)
      } else {
        const meta = await saveAsMarkdown(content, activeTab.name)
        if (meta) markTabSaved(activeTabId, meta.path, meta.name, meta.sourceType)
      }
    } finally { setSaving(false) }
  }, [content, activeTab, activeTabId, markTabSaved])

  const handleExportMd = useCallback(async () => {
    if (!activeTab || !activeTabId) return
    setSaving(true)
    try {
      const meta = await saveAsMarkdown(content, activeTab.name || 'untitled')
      if (meta) markTabSaved(activeTabId, meta.path, meta.name, meta.sourceType)
    } finally { setSaving(false) }
  }, [content, activeTab, activeTabId, markTabSaved])

  /** 导出 docx，根据模板选择决定 reference */
  const handleExportDocxWithTemplate = useCallback(async (choice: TemplateChoice) => {
    if (!activeTab || !activeTabId) return
    setSaving(true)
    try {
      let refPath: string | undefined
      if (choice.type === 'original') {
        refPath = activeTab.referenceDocxPath
      } else if (choice.type === 'custom') {
        refPath = choice.path
      }
      // type === 'builtin' → refPath 为 undefined，后端使用内置默认模板
      const meta = await saveAsDocx(content, activeTab.name || 'untitled', refPath)
      if (meta) markTabSaved(activeTabId, meta.path, meta.name, meta.sourceType)
    } finally { setSaving(false) }
  }, [content, activeTab, activeTabId, markTabSaved])

  const handleCloseTab = useCallback((id: string) => {
    const tab = tabs.find(t => t.id === id)
    if (tab?.isDirty) {
      setCloseConfirm({ id, name: tab.name })
      return
    }
    closeTab(id)
  }, [tabs, closeTab])

  const handleOpenFolder = () => window.dispatchEvent(new CustomEvent('mark-doc:open-folder'))

  const editorActions: EditorToolbarActions = useMemo(() => ({
    onNew: createNewTab,
    onSave: handleSave,
    onExportMd: handleExportMd,
    onExportDocx: () => setExportDocxOpen(true),
    onOpen: () => file.openFileDialog(),
    onOpenFolder: handleOpenFolder,
    pageWidth,
    onPageWidthChange,
    recentFiles: file.recentFiles,
    openFileFromPath: file.openFileFromPath,
    removeRecentFile: file.removeRecentFile,
    clearRecentFiles: file.clearRecentFiles,
  }), [createNewTab, handleSave, handleExportMd, file, pageWidth, onPageWidthChange])

  // Ctrl+滚轮缩放
  useEffect(() => {
    const el = editorAreaRef.current
    if (!el) return
    const h = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        setZoom(z => Math.min(200, Math.max(50, z + (e.deltaY > 0 ? -10 : 10))))
      }
    }
    el.addEventListener('wheel', h, { passive: false })
    return () => el.removeEventListener('wheel', h)
  }, [])

  // 快捷键
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      if (e.key === 'a' && !(e.target as HTMLElement).closest('.vditor')) e.preventDefault()
      if (e.key === 's') { e.preventDefault(); handleSave() }
      if (e.key === 'w' && activeTabId) { e.preventDefault(); handleCloseTab(activeTabId) }
      if (e.key === 'n') { e.preventDefault(); createNewTab() }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [handleSave, activeTabId, handleCloseTab, createNewTab])

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {/* 标签栏（多于1个标签时显示） */}
      {tabs.length > 1 && (
        <div className="flex items-center border-b border-border shrink-0 px-1 h-9">
          <div className="flex-1 flex items-center overflow-x-auto no-scrollbar">
            {tabs.map(tab => (
              <div key={tab.id}
                className={`group flex items-center gap-1 px-2.5 py-1.5 text-[11px] cursor-pointer shrink-0 max-w-[150px] rounded-md transition-colors ${
                  tab.id === activeTabId ? 'text-foreground bg-accent' : 'text-muted-foreground/50 hover:text-muted-foreground'
                }`}
                onClick={() => switchTab(tab.id)}>
                <FileText size={11} className="shrink-0" />
                <span className="truncate">{tab.name}</span>
                {tab.isDirty && <span className="w-1 h-1 rounded-full bg-primary shrink-0" />}
                <button className="p-0 border-none bg-transparent text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground cursor-pointer shrink-0 flex items-center" onClick={(e) => { e.stopPropagation(); handleCloseTab(tab.id) }}>
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 编辑区 */}
      <div ref={editorAreaRef} className="flex-1 overflow-y-auto overflow-x-hidden relative">
        {activeTab ? (
          <>
            <div className={`h-full mx-auto ${PAGE_WIDTH_CLASS[pageWidth]}`}>
              <Editor
                key={activeTabId || 'e'}
                content={content}
                onChange={handleContentChange}
                zoom={zoom}
                actions={editorActions}
              />
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <p className="text-muted-foreground/40 text-sm">打开文件或新建文件开始编辑</p>
            <div className="flex gap-2">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:bg-accent cursor-pointer text-foreground text-xs bg-transparent" onClick={createNewTab}>新建</button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:bg-accent cursor-pointer text-foreground text-xs bg-transparent" onClick={() => file.openFileDialog()}>打开文件</button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:bg-accent cursor-pointer text-foreground text-xs bg-transparent" onClick={handleOpenFolder}>打开文件夹</button>
            </div>
          </div>
        )}
      </div>

      {/* 字数胶囊 */}
      {activeTab && (
        <div className="absolute bottom-3 right-3 z-10">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-foreground/5 backdrop-blur-sm text-[11px] text-muted-foreground opacity-40 hover:opacity-100 transition-opacity select-none">
            <span>{content.length} 字</span>
            {zoom !== 100 && (
              <>
                <span className="text-border">·</span>
                <button className="border-none bg-transparent text-[11px] text-muted-foreground cursor-pointer hover:text-foreground p-0" onClick={() => setZoom(100)}>{zoom}%</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* 关闭确认弹窗 */}
      {closeConfirm && (
        <CloseConfirmDialog
          open={!!closeConfirm}
          fileName={closeConfirm.name}
          onClose={() => setCloseConfirm(null)}
          onDiscard={() => { closeTab(closeConfirm.id); setCloseConfirm(null) }}
          onSave={async () => {
            await handleSave()
            closeTab(closeConfirm.id)
            setCloseConfirm(null)
          }}
        />
      )}

      {/* 导出 docx 模板选择弹窗 */}
      <ExportDocxDialog
        open={exportDocxOpen}
        onOpenChange={setExportDocxOpen}
        originalDocxPath={activeTab?.referenceDocxPath}
        onExport={handleExportDocxWithTemplate}
      />
    </div>
  )
}
