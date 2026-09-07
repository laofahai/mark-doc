import { useEffect, useRef, useState } from 'react'
import {
  Check,
  Clock,
  Download,
  FileDown,
  FilePlus,
  FolderOpen,
  Minimize2,
  Plus,
  Printer,
  RectangleHorizontal,
  RectangleVertical,
  Save,
  StretchHorizontal,
  Trash2,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { DocumentPageLayout, DocumentPageOrientation, DocumentPageSize } from '../services/document/page-layout'
import type { EditorViewMode } from './sidebar-width'

export type DocumentEditorViewMode = EditorViewMode

export interface DocumentCommandActions {
  onNew: () => void
  onSave: () => void
  onExportMd: () => void
  onExportDocx: () => void
  onOpen: () => void
  onOpenFolder: () => void
  hasActiveDocument: boolean
  viewMode: DocumentEditorViewMode
  onViewModeChange: (mode: DocumentEditorViewMode) => void
  pageLayout: DocumentPageLayout
  onPageLayoutChange: (layout: DocumentPageLayout) => void
  onPrint: () => void
  recentFiles: { path: string; name: string }[]
  openFileFromPath: (path: string, name: string) => void
  removeRecentFile: (path: string) => void
  clearRecentFiles: () => void
}

type MenuId = 'file' | 'export' | 'view' | 'page'

const iconButtonClass = [
  'h-7 w-7 border-none bg-transparent text-muted-foreground',
  'inline-flex items-center justify-center rounded-md cursor-pointer',
  'transition-colors hover:bg-accent hover:text-foreground',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
].join(' ')

const menuPanelClass = [
  'absolute top-8 right-0 min-w-44 rounded-lg border border-border',
  'bg-popover/95 text-popover-foreground shadow-lg backdrop-blur-md p-1',
].join(' ')

const menuButtonClass = [
  'w-full border-none bg-transparent text-left text-xs text-popover-foreground',
  'flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer',
  'hover:bg-accent hover:text-accent-foreground',
].join(' ')

const viewModeIcons: Record<DocumentEditorViewMode, LucideIcon> = {
  fit: Minimize2,
  actual: RectangleHorizontal,
  wide: StretchHorizontal,
}

const pageLayoutIcons: Record<DocumentPageOrientation, LucideIcon> = {
  portrait: RectangleVertical,
  landscape: RectangleHorizontal,
}

function pageLayoutWithSize(layout: DocumentPageLayout, size: DocumentPageSize): DocumentPageLayout {
  return { ...layout, size }
}

function pageLayoutWithOrientation(layout: DocumentPageLayout, orientation: DocumentPageOrientation): DocumentPageLayout {
  return { ...layout, orientation }
}

function runCommand(command: () => void, close: () => void) {
  command()
  close()
}

export function DocumentCommandBar({ actions }: { actions: DocumentCommandActions }) {
  const { t } = useTranslation()
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const closeMenu = () => setOpenMenu(null)
  const toggleMenu = (menu: MenuId) => setOpenMenu(current => current === menu ? null : menu)
  const ViewModeIcon = viewModeIcons[actions.viewMode]
  const PageLayoutIcon = pageLayoutIcons[actions.pageLayout.orientation]

  useEffect(() => {
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closeMenu()
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu()
    }
    window.addEventListener('pointerdown', closeOnPointerDown)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', closeOnPointerDown)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  return (
    <div
      ref={rootRef}
      role="toolbar"
      aria-label={t('toolbar.documentCommands')}
      className="document-command-bar document-command-bar--header pointer-events-auto flex items-center gap-0.5 rounded-md border border-transparent bg-transparent px-0 py-0"
    >
      <div className="relative">
        <button
          type="button"
          className={iconButtonClass}
          aria-label={t('toolbar.file')}
          title={t('toolbar.file')}
          onClick={() => toggleMenu('file')}
        >
          <FilePlus size={14} />
        </button>
        {openMenu === 'file' && (
          <div role="menu" data-placement="bottom-end" className={menuPanelClass}>
            <button type="button" role="menuitem" className={menuButtonClass} onClick={() => runCommand(actions.onNew, closeMenu)}>
              <Plus size={14} /> {t('toolbar.newFile')}
            </button>
            <button type="button" role="menuitem" className={menuButtonClass} onClick={() => runCommand(actions.onOpen, closeMenu)}>
              <FilePlus size={14} /> {t('toolbar.openFile')}
            </button>
            <button type="button" role="menuitem" className={menuButtonClass} onClick={() => runCommand(actions.onOpenFolder, closeMenu)}>
              <FolderOpen size={14} /> {t('toolbar.openFolder')}
            </button>
            {actions.recentFiles.length > 0 && (
              <>
                <div className="my-1 h-px bg-border" />
                <div className="flex items-center justify-between px-2 py-1 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Clock size={11} /> {t('toolbar.recent')}</span>
                  <button
                    type="button"
                    className="border-none bg-transparent p-0.5 text-muted-foreground hover:text-destructive cursor-pointer"
                    aria-label={t('toolbar.clearRecent')}
                    title={t('toolbar.clearRecent')}
                    onClick={() => runCommand(actions.clearRecentFiles, closeMenu)}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
                {actions.recentFiles.map(file => (
                  <div key={file.path} role="none" className="group flex items-center gap-1 rounded-md hover:bg-accent">
                    <button
                      type="button"
                      role="menuitem"
                      className="min-w-0 flex-1 border-none bg-transparent px-2 py-1.5 text-left text-xs text-popover-foreground cursor-pointer"
                      onClick={() => runCommand(() => actions.openFileFromPath(file.path, file.name), closeMenu)}
                    >
                      <span className="block truncate">{file.name}</span>
                    </button>
                    <button
                      type="button"
                      className="mr-1 border-none bg-transparent p-1 text-muted-foreground opacity-0 cursor-pointer group-hover:opacity-100 hover:text-destructive"
                      aria-label={t('toolbar.removeRecent', { name: file.name })}
                      title={t('toolbar.removeRecent', { name: file.name })}
                      onClick={() => actions.removeRecentFile(file.path)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {actions.hasActiveDocument && (
        <>
          <div className="h-4 w-px bg-border" />

          <button
            type="button"
            className={iconButtonClass}
            aria-label={t('toolbar.save')}
            title={t('toolbar.saveShortcut')}
            onClick={actions.onSave}
          >
            <Save size={14} />
          </button>

          <div className="relative">
            <button
              type="button"
              className={iconButtonClass}
              aria-label={t('toolbar.export')}
              title={t('toolbar.export')}
              onClick={() => toggleMenu('export')}
            >
              <Download size={14} />
            </button>
            {openMenu === 'export' && (
              <div role="menu" data-placement="bottom-end" className={menuPanelClass}>
                <button type="button" role="menuitem" className={menuButtonClass} onClick={() => runCommand(actions.onExportMd, closeMenu)}>
                  <FileDown size={14} /> {t('toolbar.exportMd')}
                </button>
                <button type="button" role="menuitem" className={menuButtonClass} onClick={() => runCommand(actions.onExportDocx, closeMenu)}>
                  <FileDown size={14} /> {t('toolbar.exportDocx')}
                </button>
                <button type="button" role="menuitem" className={menuButtonClass} onClick={() => runCommand(actions.onPrint, closeMenu)}>
                  <Printer size={14} /> {t('toolbar.exportPdf')}
                </button>
              </div>
            )}
          </div>

          <div className="h-4 w-px bg-border" />

          <div className="relative">
            <button
              type="button"
              className={iconButtonClass}
              aria-label={t('toolbar.editorView')}
              title={t('toolbar.editorView')}
              onClick={() => toggleMenu('view')}
            >
              <ViewModeIcon size={14} />
            </button>
            {openMenu === 'view' && (
              <div role="menu" data-placement="bottom-end" className={menuPanelClass}>
                {[
                  ['fit', t('toolbar.viewFit')],
                  ['actual', t('toolbar.viewActual')],
                  ['wide', t('toolbar.viewWide')],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={actions.viewMode === value}
                    className={menuButtonClass}
                    onClick={() => runCommand(() => actions.onViewModeChange(value as DocumentEditorViewMode), closeMenu)}
                  >
                    <span className="inline-flex h-3.5 w-3.5 items-center justify-center">
                      {actions.viewMode === value && <Check size={13} />}
                    </span>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              className={iconButtonClass}
              aria-label={t('toolbar.pageSetup')}
              title={t('toolbar.pageSetup')}
              onClick={() => toggleMenu('page')}
            >
              <PageLayoutIcon size={14} />
            </button>
            {openMenu === 'page' && (
              <div role="menu" data-placement="bottom-end" className={menuPanelClass}>
                {([
                  ['a4', t('toolbar.pageSizeA4')],
                  ['letter', t('toolbar.pageSizeLetter')],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={actions.pageLayout.size === value}
                    className={menuButtonClass}
                    onClick={() => runCommand(() => actions.onPageLayoutChange(pageLayoutWithSize(actions.pageLayout, value)), closeMenu)}
                  >
                    <span className="inline-flex h-3.5 w-3.5 items-center justify-center">
                      {actions.pageLayout.size === value && <Check size={13} />}
                    </span>
                    {label}
                  </button>
                ))}
                <div className="my-1 h-px bg-border" />
                {([
                  ['portrait', t('toolbar.orientationPortrait'), RectangleVertical],
                  ['landscape', t('toolbar.orientationLandscape'), RectangleHorizontal],
                ] as const).map(([value, label, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={actions.pageLayout.orientation === value}
                    className={menuButtonClass}
                    onClick={() => runCommand(() => actions.onPageLayoutChange(pageLayoutWithOrientation(actions.pageLayout, value)), closeMenu)}
                  >
                    <span className="inline-flex h-3.5 w-3.5 items-center justify-center">
                      {actions.pageLayout.orientation === value && <Check size={13} />}
                    </span>
                    <Icon size={14} /> {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            className={iconButtonClass}
            aria-label={t('toolbar.print')}
            title={t('toolbar.print')}
            onClick={actions.onPrint}
          >
            <Printer size={14} />
          </button>
        </>
      )}
    </div>
  )
}
