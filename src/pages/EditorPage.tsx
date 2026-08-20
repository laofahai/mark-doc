import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import Editor from '../components/Editor/Editor'
import type { EditorToolbarActions } from '../components/Editor/EditorToolbarOverlay'
import { CloseConfirmDialog } from '../components/CloseConfirmDialog'
import { ExportDocxDialog, type TemplateChoice } from '../components/ExportDocxDialog'
import { RecoveryPanel } from '../components/RecoveryPanel'
import { PackageSecurityPanel } from '../components/PackageSecurityPanel'
import { saveAsMarkdown, saveFile, convertMdToDocx } from '../services/file'
import { open } from '@tauri-apps/plugin-dialog'
import { useFile, type FileTab } from '../contexts/FileContext'
import { useDocument } from '../contexts/DocumentContext'
import type { DocumentTab } from '../contexts/DocumentContext'
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
type VisibleTab = {
  kind: 'file' | 'document'
  id: string
  name: string
  isDirty: boolean
}

interface Props {
  pageWidth: PageWidth
  onPageWidthChange: (w: PageWidth) => void
}

export function EditorPage({ pageWidth, onPageWidthChange }: Props) {
  const { t } = useTranslation()
  const file = useFile()
  const documentContext = useDocument()
  const { tabs, activeTab, activeTabId, setTabContent, markTabSaved, closeTab, switchTab, clearActiveTab, externalChange, reloadTab, dismissExternalChange } = file
  const [, setSaving] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [closeConfirm, setCloseConfirm] = useState<{ kind: 'file' | 'document'; id: string; name: string } | null>(null)
  const [exportDocxOpen, setExportDocxOpen] = useState(false)
  const editorAreaRef = useRef<HTMLDivElement>(null)
  const activeDocument = documentContext.activeDocument
  const activeDocumentTab = documentContext.tabs.find(tab => tab.id === documentContext.activeTabId) || null
  const content = activeDocument?.markdown ?? activeTab?.content ?? ''
  const visibleTabs = useMemo(() => [
    ...documentContext.tabs.map(tab => ({
      kind: 'document' as const,
      id: tab.id,
      name: tab.name,
      isDirty: tab.isDirty,
    })),
    ...tabs.map(tab => ({
      kind: 'file' as const,
      id: tab.id,
      name: tab.name,
      isDirty: tab.isDirty,
    })),
  ], [documentContext.tabs, documentContext.activeTabId, activeDocument, tabs])
  const activeVisibleTabKey = activeDocument
    ? `document:${documentContext.activeTabId}`
    : activeTabId
      ? `file:${activeTabId}`
      : null

  const switchDocumentVisibleTab = useCallback((id: string) => {
    clearActiveTab()
    documentContext.switchDocumentTab(id)
  }, [clearActiveTab, documentContext])

  const switchFileVisibleTab = useCallback((id: string) => {
    documentContext.clearActiveDocument()
    switchTab(id)
  }, [documentContext, switchTab])

  const activateFallbackAfterClose = useCallback((tab: VisibleTab) => {
    if (`${tab.kind}:${tab.id}` !== activeVisibleTabKey) return

    if (tab.kind === 'document') {
      const nextDocument = documentContext.tabs.find(candidate => candidate.id !== tab.id)
      if (nextDocument) return
      const nextFile = tabs[0]
      if (nextFile) switchFileVisibleTab(nextFile.id)
      return
    }

    const nextFile = tabs.find(candidate => candidate.id !== tab.id)
    if (nextFile) return
    const nextDocument = documentContext.tabs[0]
    if (nextDocument) switchDocumentVisibleTab(nextDocument.id)
  }, [activeVisibleTabKey, documentContext.tabs, tabs, switchDocumentVisibleTab, switchFileVisibleTab])

  const createNewDocument = useCallback(() => {
    clearActiveTab()
    documentContext.createNewDocument()
  }, [clearActiveTab, documentContext])

  const openDocumentDialog = useCallback(async () => {
    const path = await open({
      filters: [
        { name: 'MarkDoc Package', extensions: ['mdoc'] },
        { name: 'Markdown', extensions: ['md'] },
        { name: 'Word', extensions: ['docx'] },
      ],
    })
    if (!path) return
    const filePath = path as string
    clearActiveTab()
    await documentContext.openFileFromPath(filePath, filePath.split('/').pop() || 'untitled')
  }, [clearActiveTab, documentContext])

  useEffect(() => {
    if (activeTabId && activeDocument) {
      documentContext.clearActiveDocument()
    }
  }, [activeTabId, activeDocument, documentContext])

  const handleContentChange = useCallback((md: string) => {
    if (activeDocument) {
      documentContext.setActiveMarkdown(md)
      return
    }
    setTabContent(md)
  }, [activeDocument, documentContext, setTabContent])

  const saveDocumentTab = useCallback(async (tab: DocumentTab | null) => {
    if (!tab) return false
    const document = documentContext.getDocumentForTab(tab.id)
    if (!document) return false
    const meta = await saveAsMarkdown(document.markdown, tab.name || 'untitled.mdoc')
    if (!meta) return false
    documentContext.markDocumentTabSavedAsMarkdown(tab.id, meta.path)
    documentContext.discardRecovery(document.id)
    return true
  }, [documentContext])

  const saveFileTab = useCallback(async (tab: FileTab | null) => {
    if (!tab) return false
    if (tab.path) {
      const ok = await saveFile(tab.path, tab.content, tab.referenceDocxPath)
      if (ok) markTabSaved(tab.id)
      return ok
    }
    const meta = await saveAsMarkdown(tab.content, tab.name)
    if (!meta) return false
    markTabSaved(tab.id, meta.path, meta.name, meta.sourceType)
    return true
  }, [markTabSaved])

  const saveVisibleTab = useCallback(async (tab: VisibleTab) => {
    if (tab.kind === 'document') {
      const documentTab = documentContext.tabs.find(candidate => candidate.id === tab.id) || null
      return saveDocumentTab(documentTab)
    }
    const fileTab = tabs.find(candidate => candidate.id === tab.id) || null
    return saveFileTab(fileTab)
  }, [documentContext.tabs, saveDocumentTab, saveFileTab, tabs])

  const handleSave = useCallback(async () => {
    if (activeDocument) {
      setSaving(true)
      try {
        await documentContext.saveActiveDocument()
      } finally { setSaving(false) }
      return
    }

    if (!activeTab || !activeTabId) return
    setSaving(true)
    try {
      await saveFileTab(activeTab)
    } finally { setSaving(false) }
  }, [activeDocument, activeTab, activeTabId, documentContext, saveFileTab])

  const handleExportMd = useCallback(async () => {
    if (activeDocument) {
      setSaving(true)
      try {
        await saveDocumentTab(activeDocumentTab)
      } finally { setSaving(false) }
      return
    }

    if (!activeTab || !activeTabId) return
    setSaving(true)
    try {
      const meta = await saveAsMarkdown(content, activeTab.name || 'untitled')
      if (meta) markTabSaved(activeTabId, meta.path, meta.name, meta.sourceType)
    } finally { setSaving(false) }
  }, [activeDocument, activeDocumentTab, content, activeTab, activeTabId, markTabSaved, saveDocumentTab])

  /** 导出 docx，模板和保存路径已由弹窗确定 */
  const handleExportDocxWithTemplate = useCallback(async (choice: TemplateChoice, outputPath: string) => {
    if (!activeDocument && (!activeTab || !activeTabId)) return
    setSaving(true)
    try {
      let refPath: string | undefined
      if (activeDocument && choice.type === 'original') {
        refPath = activeDocument.presentation.docx?.referenceDocx
      } else if (!activeDocument && choice.type === 'original') {
        refPath = activeTab?.referenceDocxPath
      } else if (choice.type === 'custom') {
        refPath = choice.path
      }
      if (activeDocument) {
        await documentContext.exportActiveDocx(outputPath, refPath)
        return
      }
      const ok = await convertMdToDocx(content, outputPath, refPath)
      if (ok && !activeDocument && activeTabId) {
        const name = outputPath.split('/').pop() || 'untitled.docx'
        markTabSaved(activeTabId, outputPath, name, 'docx')
      }
    } catch (err) {
      console.error('Export docx failed:', err)
      alert(String(err))
    } finally { setSaving(false) }
  }, [activeDocument, content, activeTab, activeTabId, markTabSaved, documentContext])

  const switchVisibleTab = useCallback((tab: { kind: 'file' | 'document'; id: string }) => {
    if (tab.kind === 'document') {
      switchDocumentVisibleTab(tab.id)
      return
    }
    switchFileVisibleTab(tab.id)
  }, [switchDocumentVisibleTab, switchFileVisibleTab])

  const closeVisibleTab = useCallback((tab: VisibleTab) => {
    activateFallbackAfterClose(tab)
    if (tab.kind === 'document') {
      documentContext.closeDocumentTab(tab.id)
      return
    }
    closeTab(tab.id)
  }, [activateFallbackAfterClose, closeTab, documentContext])

  const handleCloseVisibleTab = useCallback((tab: VisibleTab) => {
    if (tab.isDirty) {
      setCloseConfirm({ kind: tab.kind, id: tab.id, name: tab.name })
      return
    }
    closeVisibleTab(tab)
  }, [closeVisibleTab])

  const handleOpenFolder = () => window.dispatchEvent(new CustomEvent('mark-doc:open-folder'))

  const editorActions: EditorToolbarActions = useMemo(() => ({
    onNew: createNewDocument,
    onSave: handleSave,
    onExportMd: handleExportMd,
    onExportDocx: () => setExportDocxOpen(true),
    onOpen: openDocumentDialog,
    onOpenFolder: handleOpenFolder,
    pageWidth,
    onPageWidthChange,
    recentFiles: file.recentFiles,
    openFileFromPath: (path, name) => { clearActiveTab(); void documentContext.openFileFromPath(path, name) },
    removeRecentFile: file.removeRecentFile,
    clearRecentFiles: file.clearRecentFiles,
  }), [createNewDocument, handleSave, handleExportMd, file, documentContext, clearActiveTab, openDocumentDialog, pageWidth, onPageWidthChange])

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
    if (visibleTabs.length < 2 || !activeVisibleTabKey) return
    const idx = visibleTabs.findIndex(tab => `${tab.kind}:${tab.id}` === activeVisibleTabKey)
    const next = visibleTabs[(idx + direction + visibleTabs.length) % visibleTabs.length]
    switchVisibleTab(next)
  }, [visibleTabs, activeVisibleTabKey, switchVisibleTab])

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
      if (e.key === 'w' && activeVisibleTabKey) {
        e.preventDefault()
        const active = visibleTabs.find(tab => `${tab.kind}:${tab.id}` === activeVisibleTabKey)
        if (active) handleCloseVisibleTab(active)
      }
      if (e.key === 'n') { e.preventDefault(); createNewDocument() }
      if (e.key === 'o') { e.preventDefault(); void openDocumentDialog() }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [handleSave, activeVisibleTabKey, visibleTabs, handleCloseVisibleTab, createNewDocument, switchToNextTab, openDocumentDialog])

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
      {documentContext.documentError && (
        <div className="flex items-center gap-2 px-4 py-2 bg-destructive/10 border-b border-destructive/30 text-sm shrink-0">
          <span className="flex-1 text-foreground">{t(documentContext.documentError.messageKey, documentContext.documentError.params)}</span>
          <button className="px-2.5 py-1 rounded text-xs bg-transparent text-muted-foreground hover:text-foreground border border-border cursor-pointer" onClick={documentContext.dismissDocumentError}>{t('common.done')}</button>
        </div>
      )}
      {documentContext.resourceSuggestion && (
        <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 border-b border-primary/30 text-sm shrink-0">
          <span className="flex-1 text-foreground">{t('document.suggestPackage')}</span>
          <button className="px-2.5 py-1 rounded text-xs bg-transparent text-muted-foreground hover:text-foreground border border-border cursor-pointer" onClick={documentContext.dismissResourceSuggestion}>{t('common.done')}</button>
        </div>
      )}
      {documentContext.recoveryState && (
        <RecoveryPanel
          state={documentContext.recoveryState}
          onRetry={() => void documentContext.retryRecovery(documentContext.recoveryState!.documentId)}
          onSaveAs={() => void saveDocumentTab(documentContext.tabs.find(tab => tab.documentId === documentContext.recoveryState!.documentId) ?? null)}
          onRestore={() => documentContext.restoreRecovery(documentContext.recoveryState!.documentId)}
          onDiscard={() => documentContext.discardRecovery(documentContext.recoveryState!.documentId)}
        />
      )}
      <PackageSecurityPanel
        quarantined={documentContext.activeDocument?.workspace.packageQuarantined ?? []}
        onTrustDocument={documentContext.trustActiveDocument}
        onAllowResourceType={documentContext.allowActiveRemoteResourceType}
        onAllowDomain={documentContext.allowActiveRemoteDomain}
        onAllowUrl={documentContext.allowActiveRemoteUrl}
      />
      {/* 标签栏（多于1个标签时显示） */}
      {visibleTabs.length > 1 && (
        <div className="flex items-center border-b border-border shrink-0 px-1 h-9">
          <div className="flex-1 flex items-center overflow-x-auto no-scrollbar">
            {visibleTabs.map(tab => (
              <div key={`${tab.kind}:${tab.id}`}
                className={`group flex items-center gap-1 px-2.5 py-1.5 text-[11px] cursor-pointer shrink-0 max-w-[150px] rounded-md transition-colors ${
                  `${tab.kind}:${tab.id}` === activeVisibleTabKey ? 'text-foreground bg-accent' : 'text-muted-foreground/50 hover:text-muted-foreground'
                }`}
                onClick={() => switchVisibleTab(tab)}>
                <FileText size={11} className="shrink-0" />
                <span className="truncate">{tab.name}</span>
                {tab.isDirty && <span className="w-1 h-1 rounded-full bg-primary shrink-0" />}
                <button className="p-0 border-none bg-transparent text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground cursor-pointer shrink-0 flex items-center" onClick={(e) => { e.stopPropagation(); handleCloseVisibleTab(tab) }}>
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 编辑区 */}
      <div ref={editorAreaRef} className="flex-1 overflow-y-auto overflow-x-hidden relative">
        {activeTab || documentContext.activeDocument ? (
          <>
            <div className={`h-full mx-auto ${PAGE_WIDTH_CLASS[pageWidth]}`}>
              <Editor
                key={documentContext.activeDocument?.id ?? activeTabId ?? 'e'}
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
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:bg-accent cursor-pointer text-foreground text-xs bg-transparent" onClick={createNewDocument}>{t('common.newFile')}</button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:bg-accent cursor-pointer text-foreground text-xs bg-transparent" onClick={() => void openDocumentDialog()}>{t('common.open')}</button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:bg-accent cursor-pointer text-foreground text-xs bg-transparent" onClick={handleOpenFolder}>{t('common.openFolder')}</button>
            </div>
          </div>
        )}
      </div>

      {/* 底部状态栏 */}
      <div className="flex items-center justify-between px-2.5 h-6 shrink-0 border-t border-border text-[10px] text-muted-foreground/50 select-none">
        <div className="flex items-center gap-2.5">
          <a href="https://linch.tech" target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground transition-colors flex items-center gap-1 no-underline text-inherit">
            <span>Present by Linch Tech</span>
          </a>
          <a href="https://linch.tech/zh/products/mark-doc" target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground transition-colors flex items-center no-underline text-inherit" title="MarkDoc">
            <Globe size={10} />
          </a>
          <a href="https://github.com/laofahai/mark-doc" target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground transition-colors flex items-center no-underline text-inherit">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
          </a>
        </div>
        {activeTab || documentContext.activeDocument ? (
          <div className="flex items-center gap-2">
            <span>{getPlainTextLength(content)} {t('common.chars')}</span>
            {zoom !== 100 && (
              <>
                <span className="text-border">·</span>
                <button className="border-none bg-transparent text-[10px] text-muted-foreground/50 cursor-pointer hover:text-muted-foreground p-0" onClick={() => setZoom(100)}>{zoom}%</button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {/* 关闭确认弹窗 */}
      {closeConfirm && (
        <CloseConfirmDialog
          open={!!closeConfirm}
          fileName={closeConfirm.name}
          onClose={() => setCloseConfirm(null)}
          onDiscard={() => {
            const target = visibleTabs.find(tab => tab.kind === closeConfirm.kind && tab.id === closeConfirm.id)
            if (target) closeVisibleTab(target)
            setCloseConfirm(null)
          }}
          onSave={async () => {
            const target = visibleTabs.find(tab => tab.kind === closeConfirm.kind && tab.id === closeConfirm.id)
            if (!target) {
              setCloseConfirm(null)
              return
            }
            const saved = await saveVisibleTab(target)
            if (saved) {
              closeVisibleTab(target)
              setCloseConfirm(null)
            }
          }}
        />
      )}

      {/* 导出 docx 模板选择弹窗 */}
      <ExportDocxDialog
        open={exportDocxOpen}
        onOpenChange={setExportDocxOpen}
        originalDocxPath={activeDocument?.presentation.docx?.referenceDocx ?? activeTab?.referenceDocxPath}
        defaultFileName={activeDocument ? activeDocumentTab?.name : activeTab?.name}
        currentFilePath={activeDocument ? undefined : activeTab?.path}
        onExport={handleExportDocxWithTemplate}
      />
    </div>
  )
}
