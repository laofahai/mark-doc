import { Download, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { APP_VERSION } from '../app-version'
import { useAppUpdater } from '../hooks/useAppUpdater'

function formatPercent(downloaded?: number, contentLength?: number) {
  if (!downloaded || !contentLength || contentLength <= 0) {
    return 0
  }

  return Math.min(100, Math.round((downloaded / contentLength) * 100))
}

interface SettingsUpdateSectionProps {
  hasUnsavedDocuments?: boolean
}

export function SettingsUpdateSection({ hasUnsavedDocuments = false }: SettingsUpdateSectionProps) {
  const { t } = useTranslation()
  const updater = useAppUpdater()
  const progressPercent = formatPercent(updater.progress?.downloaded, updater.progress?.contentLength)
  const checking = updater.status === 'checking'
  const downloading = updater.status === 'downloading'
  const busy = checking || downloading || updater.status === 'restarting'
  const installBlocked = hasUnsavedDocuments && updater.status === 'available'

  return (
    <section className="rounded-lg border p-4 bg-card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">{t('settings.updateTitle')}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {t('settings.currentVersion', { version: `v${APP_VERSION}` })}
          </div>
        </div>

        {updater.status !== 'unsupported' && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground bg-background hover:bg-accent disabled:opacity-50 disabled:cursor-default transition-colors"
            onClick={() => void updater.checkNow()}
            disabled={busy}
          >
            <RefreshCw size={13} className={checking ? 'animate-spin' : ''} />
            {checking ? t('settings.checkingUpdates') : t('settings.checkForUpdates')}
          </button>
        )}
      </div>

      {updater.status === 'upToDate' && (
        <p className="text-xs text-muted-foreground">{t('settings.upToDate')}</p>
      )}

      {updater.status === 'unsupported' && (
        <p className="text-xs text-muted-foreground">{t('settings.updatesDesktopOnly')}</p>
      )}

      {updater.status === 'error' && (
        <p className="text-xs text-destructive">{t('settings.updateFailed', { message: updater.error || t('errors.save.failed') })}</p>
      )}

      {updater.update && (
        <div className="space-y-2 rounded-md bg-accent/45 px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-medium text-foreground">
                {t('settings.updateAvailable', { version: updater.update.version })}
              </div>
              {updater.update.date && (
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {t('settings.releaseDate', { date: updater.update.date })}
                </div>
              )}
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50 disabled:cursor-default transition-opacity"
              onClick={() => void updater.installAndRestart()}
              disabled={busy || installBlocked}
            >
              <Download size={13} />
              {downloading ? t('settings.downloadingUpdate', { percent: progressPercent }) : t('settings.downloadAndRestart')}
            </button>
          </div>

          {installBlocked && (
            <p className="text-xs text-muted-foreground">
              {t('settings.updateBlockedByUnsavedChanges')}
            </p>
          )}

          {updater.update.body && (
            <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-4">
              {updater.update.body}
            </p>
          )}

          {downloading && (
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent}
              className="h-1.5 overflow-hidden rounded-full bg-background"
            >
              <div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${progressPercent}%` }} />
            </div>
          )}
        </div>
      )}
    </section>
  )
}
