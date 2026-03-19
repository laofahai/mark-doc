import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import Editor from '../components/Editor/Editor'
import type { EditorToolbarActions } from '../components/Editor/EditorToolbarOverlay'
import { CloseConfirmDialog } from '../components/CloseConfirmDialog'
import { ExportDocxDialog, type TemplateChoice } from '../components/ExportDocxDialog'
import { saveAsMarkdown, saveFile, convertMdToDocx } from '../services/file'
import { useFile } from '../contexts/FileContext'
import { X, FileText, Globe } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/** 从 markdown 源码中提取纯文本，用于字数统计 */
function getPlainTextLength(md: string): number {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')      // 图片
    .replace(/\[[^\]]*\]\([^)]*\)/g, '$1')      // 链接 → 保留文本
    .replace(/^#{1,6}\s+/gm, '')                // 标题符号
    .replace(/(\*{1,3}|_{1,3}|~~)(.*?)\1/g, '$2') // 加粗/斜体/删除线
    .replace(/`{1,3}[^`]*`{1,3}/g, '')          // 行内代码
    .replace(/```[\s\S]*?```/g, '')             // 代码块
    .replace(/^\s*[-*+]\s+/gm, '')              // 无序列表符号
    .replace(/^\s*\d+\.\s+/gm, '')              // 有序列表符号
    .replace(/^\s*>\s+/gm, '')                  // 引用符号
    .replace(/---+/g, '')                       // 分割线
    .replace(/\|/g, '')                         // 表格分隔符
    .replace(/\s+/g, ' ')                       // 多余空白
    .trim()
    .length
}

type PageWidth = 'normal' | 'wide' | 'full'
const PAGE_WIDTH_CLASS = { normal: 'max-w-[800px]', wide: 'max-w-[1100px]', full: '' }

interface Props {
  pageWidth: PageWidth
  onPageWidthChange: (w: PageWidth) => void
}

export function EditorPage({ pageWidth, onPageWidthChange }: Props) {
  const { t } = useTranslation()
  const file = useFile()
  const { tabs, activeTab, activeTabId, setTabContent, markTabSaved, closeTab, switchTab, createNewTab, externalChange, reloadTab, dismissExternalChange } = file
  const [, setSaving] = useState(false)
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

  /** 导出 docx，模板和保存路径已由弹窗确定 */
  const handleExportDocxWithTemplate = useCallback(async (choice: TemplateChoice, outputPath: string) => {
    if (!activeTab || !activeTabId) return
    setSaving(true)
    try {
      let refPath: string | undefined
      if (choice.type === 'original') {
        refPath = activeTab.referenceDocxPath
      } else if (choice.type === 'custom') {
        refPath = choice.path
      }
      const ok = await convertMdToDocx(content, outputPath, refPath)
      if (ok) {
        const name = outputPath.split('/').pop() || 'untitled.docx'
        markTabSaved(activeTabId, outputPath, name, 'docx')
      }
    } catch (err) {
      console.error('Export docx failed:', err)
      alert(String(err))
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

  // 切换到下/上一个标签
  const switchToNextTab = useCallback((direction: 1 | -1) => {
    if (tabs.length < 2 || !activeTabId) return
    const idx = tabs.findIndex(t => t.id === activeTabId)
    const next = (idx + direction + tabs.length) % tabs.length
    switchTab(tabs[next].id)
  }, [tabs, activeTabId, switchTab])

  // 快捷键
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      // Ctrl+Tab / Ctrl+Shift+Tab 切换标签
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        switchToNextTab(e.shiftKey ? -1 : 1)
        return
      }
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      if (e.key === 'a' && !(e.target as HTMLElement).closest('.vditor')) e.preventDefault()
      if (e.key === 's') { e.preventDefault(); handleSave() }
      if (e.key === 'w' && activeTabId) { e.preventDefault(); handleCloseTab(activeTabId) }
      if (e.key === 'n') { e.preventDefault(); createNewTab() }
      if (e.key === 'o') { e.preventDefault(); file.openFileDialog() }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [handleSave, activeTabId, handleCloseTab, createNewTab, switchToNextTab, file])

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {/* 外部文件变化提示 */}
      {externalChange && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-sm shrink-0">
          <span className="flex-1 text-foreground">{t('editor.externalChange', { fileName: externalChange.name })}</span>
          <button className="px-2.5 py-1 rounded text-xs bg-amber-500 text-white hover:bg-amber-600 border-none cursor-pointer" onClick={() => reloadTab(externalChange.tabId)}>{t('editor.reload')}</button>
          <button className="px-2.5 py-1 rounded text-xs bg-transparent text-muted-foreground hover:text-foreground border border-border cursor-pointer" onClick={dismissExternalChange}>{t('editor.ignore')}</button>
        </div>
      )}
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
            <p className="text-muted-foreground/40 text-sm">{t('editor.startEditing')}</p>
            <div className="flex gap-2">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:bg-accent cursor-pointer text-foreground text-xs bg-transparent" onClick={createNewTab}>{t('common.newFile')}</button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:bg-accent cursor-pointer text-foreground text-xs bg-transparent" onClick={() => file.openFileDialog()}>{t('common.open')}</button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:bg-accent cursor-pointer text-foreground text-xs bg-transparent" onClick={handleOpenFolder}>{t('common.openFolder')}</button>
            </div>
          </div>
        )}
      </div>

      {/* 底部状态栏 */}
      <div className="flex items-center justify-between px-2.5 h-6 shrink-0 border-t border-border text-[10px] text-muted-foreground/50 select-none">
        <div className="flex items-center gap-2.5">
          <a href="https://linch.tech/zh/products/mark-doc" target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground transition-colors flex items-center no-underline text-inherit" title="MarkDoc">
            <Globe size={10} />
          </a>
          <a href="https://linch.tech" target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground transition-colors flex items-center gap-1 no-underline text-inherit">
            <span>Present by Linch Tech</span>
          </a>
          <a href="https://github.com/laofahai/mark-doc" target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground transition-colors flex items-center no-underline text-inherit">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
          </a>
        </div>
        {activeTab && (
          <div className="flex items-center gap-2">
            <span>{getPlainTextLength(content)} {t('common.chars')}</span>
            {zoom !== 100 && (
              <>
                <span className="text-border">·</span>
                <button className="border-none bg-transparent text-[10px] text-muted-foreground/50 cursor-pointer hover:text-muted-foreground p-0" onClick={() => setZoom(100)}>{zoom}%</button>
              </>
            )}
          </div>
        )}
      </div>

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
        defaultFileName={activeTab?.name}
        currentFilePath={activeTab?.path}
        onExport={handleExportDocxWithTemplate}
      />
    </div>
  )
}
