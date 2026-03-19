import { useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { LinchDesktopProvider, Shell, Separator, addI18nResources } from '@linch-tech/desktop-core'
import { EditorPage } from './pages/EditorPage'
import { Sidebar } from './components/Sidebar'
import { FileProvider, useFile } from './contexts/FileContext'
import { PandocGuard } from './components/PandocGuard'
import { SettingsDialog } from './components/SettingsDialog'
import type { LinchDesktopConfig } from '@linch-tech/desktop-core'
import { useTranslation } from 'react-i18next'
import { Settings } from 'lucide-react'
import zhLocale from './locales/zh'
import enLocale from './locales/en'

// 在模块级别立即注入翻译资源，确保首次渲染时就可用
addI18nResources('zh', zhLocale)
addI18nResources('en', enLocale)

type PageWidth = 'normal' | 'wide' | 'full'

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
  const { activeTab } = useFile()
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

function TitleRight({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { t } = useTranslation()
  return (
    <button
      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors bg-transparent border-none cursor-pointer"
      onClick={onOpenSettings}
      title={t('app.settings')}
    >
      <Settings size={14} />
    </button>
  )
}

function AppShell() {
  const [pageWidth, setPageWidth] = useState<PageWidth>('wide')
  const [hasFolderOpen, setHasFolderOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const config: Partial<LinchDesktopConfig> = {
    brand: { name: 'app.name', version: `v${__APP_VERSION__}` },
    nav: [],
    features: { updater: true, database: false, sentry: false },
    layout: { sidebar: { width: hasFolderOpen ? 220 : 0 } },
    slots: {
      titleBar: {
        left: <TitleLeft />,
        right: <TitleRight onOpenSettings={() => setSettingsOpen(true)} />,
      },
      sidebar: {
        afterNav: <Sidebar onFolderStateChange={setHasFolderOpen} />,
        footer: <></>,
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
            <Route path="/" element={<EditorPage pageWidth={pageWidth} onPageWidthChange={setPageWidth} />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </LinchDesktopProvider>
  )
}

function App() {
  return (
    <FileProvider>
      <PandocGuard>
        <AppShell />
      </PandocGuard>
    </FileProvider>
  )
}

export default App
