import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExportDocxDialog, type TemplateChoice } from '../components/ExportDocxDialog'
import type { DocumentCommandActions } from '../components/DocumentCommandBar'
import type { EditorViewMode } from '../components/sidebar-width'
import { useDocument, type DocumentTab } from '../contexts/DocumentContext'
import { DEFAULT_PAGE_LAYOUT } from '../services/document/page-layout'
import { documentSourcePath } from '../services/document/external-change-service'
import { exportMarkdownFile } from '../services/document/markdown-export'

interface UseDocumentCommandActionsOptions {
  viewMode: EditorViewMode
  onViewModeChange: (mode: EditorViewMode) => void
}

export function useDocumentCommandActions({ viewMode, onViewModeChange }: UseDocumentCommandActionsOptions) {
  const { t } = useTranslation()
  const documentContext = useDocument()
  const [exportDocxOpen, setExportDocxOpen] = useState(false)
  const activeDocument = documentContext.activeDocument
  const activeDocumentTab = documentContext.tabs.find(tab => tab.id === documentContext.activeTabId) || null
  const activeDocumentPath = activeDocument ? documentSourcePath(activeDocument) : null

  const exportDocumentMarkdown = useCallback(async (tab: DocumentTab | null) => {
    if (!tab) return false
    const document = documentContext.getDocumentForTab(tab.id)
    if (!document) return false
    return exportMarkdownFile({
      sourceName: tab.name,
      markdown: document.markdown,
      filterName: t('fileFilters.markdown'),
    })
  }, [documentContext, t])

  const handleSave = useCallback(async () => {
    if (!activeDocument) return
    await documentContext.saveActiveDocument()
  }, [activeDocument, documentContext])

  const handleExportMd = useCallback(async () => {
    if (!activeDocument) return
    await exportDocumentMarkdown(activeDocumentTab)
  }, [activeDocument, activeDocumentTab, exportDocumentMarkdown])

  const handleExportDocxWithTemplate = useCallback(async (choice: TemplateChoice, outputPath: string) => {
    if (!activeDocument) return
    try {
      await documentContext.exportActiveDocx(outputPath, choice)
    } catch (error) {
      console.error('Export docx failed:', error)
      alert(String(error))
    }
  }, [activeDocument, documentContext])

  const handleOpenFolder = useCallback(() => {
    window.dispatchEvent(new CustomEvent('mark-doc:open-folder'))
  }, [])

  const actions = useMemo<DocumentCommandActions>(() => ({
    onNew: documentContext.createNewDocument,
    onSave: handleSave,
    onExportMd: handleExportMd,
    onExportDocx: () => setExportDocxOpen(true),
    onOpen: () => { void documentContext.openFileDialog() },
    onOpenFolder: handleOpenFolder,
    hasActiveDocument: Boolean(activeDocument),
    viewMode,
    onViewModeChange,
    pageLayout: documentContext.activePageLayout ?? DEFAULT_PAGE_LAYOUT,
    onPageLayoutChange: documentContext.updateActivePageLayout,
    onPrint: documentContext.printActiveDocument,
    recentFiles: documentContext.recentFiles,
    openFileFromPath: (path, name) => { void documentContext.openFileFromPath(path, name) },
    removeRecentFile: documentContext.removeRecentFile,
    clearRecentFiles: documentContext.clearRecentFiles,
  }), [
    activeDocument,
    documentContext,
    handleExportMd,
    handleOpenFolder,
    handleSave,
    documentContext.activePageLayout,
    documentContext.printActiveDocument,
    documentContext.updateActivePageLayout,
    onViewModeChange,
    viewMode,
  ])

  const exportDialog = (
    <ExportDocxDialog
      open={exportDocxOpen}
      onOpenChange={setExportDocxOpen}
      originalDocxPath={activeDocument?.presentation.docx?.referenceDocx}
      defaultFileName={activeDocumentTab?.name}
      currentFilePath={activeDocumentPath ?? undefined}
      onExport={handleExportDocxWithTemplate}
    />
  )

  return { actions, exportDialog, exportDocumentMarkdown }
}
