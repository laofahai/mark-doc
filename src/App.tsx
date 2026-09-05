import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { LinchDesktopProvider, Shell, Separator, addI18nResources } from '@linch-tech/desktop-core'
import { EditorPage } from './pages/EditorPage'
import { Sidebar } from './components/Sidebar'
import { SidebarResizeHandle } from './components/SidebarResizeHandle'
import { DEFAULT_SIDEBAR_WIDTH, clampSidebarWidth, effectiveEditorViewMode, effectiveSidebarWidth, type EditorViewMode } from './components/sidebar-width'
import { DocumentCommandBar } from './components/DocumentCommandBar'
import { DocumentProvider, useDocument } from './contexts/DocumentContext'
import { PandocGuard } from './components/PandocGuard'
import { SettingsDialog } from './components/SettingsDialog'
import { useDocumentCommandActions } from './hooks/useDocumentCommandActions'
import { useDisableNativeContextMenu } from './hooks/useDisableNativeContextMenu'
import type { LinchDesktopConfig } from '@linch-tech/desktop-core'
import { useTranslation } from 'react-i18next'
import { Settings } from 'lucide-react'
import zhLocale from './locales/zh'
import enLocale from './locales/en'
import { APP_VERSION } from './app-version'

// 在模块级别立即注入翻译资源，确保首次渲染时就可用
addI18nResources('zh', zhLocale)
addI18nResources('en', enLocale)

const SIDEBAR_WIDTH_KEY = 'mark-doc-sidebar-width'
const MIN_VIEWPORT_WIDTH = 900

function loadSidebarWidth() {
  const saved = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY))
  return Number.isFinite(saved) && saved > 0 ? clampSidebarWidth(saved) : DEFAULT_SIDEBAR_WIDTH
}

function LogoIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logo_grad" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3B82F6"/>
          <stop offset="1" stopColor="#8B5CF6"/>
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill="url(#logo_grad)"/>
      <path d="M80 388 L80 124 L190 268 L300 124 C348 72,440 148,440 256 C440 364,348 404,280 388" stroke="white" strokeWidth="38" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  )
}

function TitleLeft() {
  const documentContext = useDocument()
  const activeTab = documentContext.tabs.find(tab => tab.id === documentContext.activeTabId) || null
  return (
    <div className="flex items-center gap-1.5">
      <LogoIcon size={18} />
      <span className="text-[11px] font-bold tracking-widest uppercase bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">MarkDoc</span>
      {activeTab && (
        <>
          <Separator orientation="vertical" className="h-3" />
          <span className="text-[11px] text-muted-foreground/60 truncate max-w-[250px]">
            {activeTab.name}{activeTab.isDirty ? ' ●' : ''}
          </span>
        </>
      )}
    </div>
  )
}

function TitleRight({
  viewMode,
  onViewModeChange,
  onOpenSettings,
}: {
  viewMode: EditorViewMode
  onViewModeChange: (mode: EditorViewMode) => void
  onOpenSettings: () => void
}) {
  const { t } = useTranslation()
  const documentCommands = useDocumentCommandActions({ viewMode, onViewModeChange })
  return (
    <div className="flex items-center gap-1">
      <DocumentCommandBar actions={documentCommands.actions} />
      <Separator orientation="vertical" className="h-3" />
      <button
        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors bg-transparent border-none cursor-pointer"
        onClick={onOpenSettings}
        title={t('app.settings')}
      >
        <Settings size={14} />
      </button>
      {documentCommands.exportDialog}
    </div>
  )
}

function AppShell() {
  useDisableNativeContextMenu()
  const [viewMode, setViewMode] = useState<EditorViewMode>('fit')
  const [hasSidebarContent, setHasSidebarContent] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth || MIN_VIEWPORT_WIDTH)
  const activeSidebarWidth = effectiveSidebarWidth({ hasSidebarContent, requestedWidth: sidebarWidth, viewportWidth })
  const activeViewMode = effectiveEditorViewMode(viewMode, viewportWidth)

  useEffect(() => {
    const updateViewportWidth = () => setViewportWidth(window.innerWidth || MIN_VIEWPORT_WIDTH)
    updateViewportWidth()
    window.addEventListener('resize', updateViewportWidth)
    return () => window.removeEventListener('resize', updateViewportWidth)
  }, [])

  const updateSidebarWidth = (width: number) => {
    const nextWidth = clampSidebarWidth(width)
    setSidebarWidth(nextWidth)
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(nextWidth))
  }

  const config: Partial<LinchDesktopConfig> = {
    brand: { name: 'app.name', version: `v${APP_VERSION}` },
    nav: [],
    features: { updater: true, database: false, sentry: false },
    layout: { sidebar: { width: activeSidebarWidth } },
    slots: {
      titleBar: {
        left: <TitleLeft />,
        right: (
          <TitleRight
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        ),
      },
      sidebar: {
        afterNav: <Sidebar onSidebarStateChange={setHasSidebarContent} />,
        footer: <></>,
      },
      shell: {
        beforeContent: activeSidebarWidth > 0 ? <SidebarResizeHandle width={sidebarWidth} onWidthCommit={updateSidebarWidth} /> : null,
      },
    },
    i18n: {
      defaultLanguage: localStorage.getItem('i18nextLng') || 'zh',
      supportedLanguages: ['zh', 'en'],
      resources: {
        en: enLocale,
        zh: zhLocale,
      },
    },
  }

  return (
    <LinchDesktopProvider config={config}>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route path="/" element={<EditorPage viewMode={activeViewMode} />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </LinchDesktopProvider>
  )
}

function App() {
  return (
    <DocumentProvider>
      <PandocGuard>
        <AppShell />
      </PandocGuard>
    </DocumentProvider>
  )
}

export default App
