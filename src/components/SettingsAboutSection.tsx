import { useTranslation } from 'react-i18next'
import { APP_VERSION } from '../app-version'
import markDocLogo from '../../src-tauri/icons/128x128.png'
import { SettingsUpdateSection } from './SettingsUpdateSection'

export function SettingsAboutSection({ hasUnsavedDocuments = false }: { hasUnsavedDocuments?: boolean }) {
  const { t } = useTranslation()

  return (
    <section className="p-5 space-y-5" aria-label={t('settings.about')}>
      <div className="flex items-center gap-4">
        <img src={markDocLogo} alt="" width={56} height={56} className="h-14 w-14 shrink-0" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <h2 className="text-xl font-semibold">MarkDoc</h2>
            <span className="text-xs text-muted-foreground tabular-nums break-all">v{APP_VERSION}</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('settings.aboutDescription')}</p>
        </div>
      </div>

      <SettingsUpdateSection hasUnsavedDocuments={hasUnsavedDocuments} />

      <footer className="border-t border-border pt-4 space-y-2.5 text-xs">
        <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label={t('settings.about')}>
          <a href="https://linch.tech/zh/products/mark-doc" target="_blank" rel="noopener noreferrer" className="hover:underline underline-offset-4">{t('settings.website')}</a>
          <a href="https://github.com/laofahai/mark-doc" target="_blank" rel="noopener noreferrer" className="hover:underline underline-offset-4">GitHub</a>
          <a href="https://github.com/laofahai/mark-doc/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" className="hover:underline underline-offset-4">MIT</a>
        </nav>
        <a href="https://linch.tech" target="_blank" rel="noopener noreferrer" className="inline-block text-muted-foreground hover:text-foreground">{t('settings.presentBy')}</a>
      </footer>
    </section>
  )
}
