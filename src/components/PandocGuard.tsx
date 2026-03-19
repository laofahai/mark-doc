import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Button } from '@linch-tech/desktop-core'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'

type Platform = 'macos' | 'windows' | 'linux' | 'unknown'

function getPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('mac')) return 'macos'
  if (ua.includes('win')) return 'windows'
  if (ua.includes('linux')) return 'linux'
  return 'unknown'
}

const INSTALL_TIP_KEYS: Record<Platform, string> = {
  macos: 'pandoc.macosGuide',
  windows: 'pandoc.windowsGuide',
  linux: 'pandoc.linuxGuide',
  unknown: 'pandoc.unknownGuide',
}

interface Props {
  children: ReactNode
}

export function PandocGuard({ children }: Props) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<'checking' | 'ready' | 'missing'>('checking')
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)
  const platform = getPlatform()

  const checkPandoc = useCallback(async () => {
    setStatus('checking')
    try {
      const version = await invoke<string | null>('check_pandoc_available')
      setStatus(version ? 'ready' : 'missing')
    } catch {
      setStatus('missing')
    }
  }, [])

  useEffect(() => { checkPandoc() }, [checkPandoc])

  const handleAutoInstall = useCallback(async () => {
    setInstalling(true)
    setInstallError(null)
    try {
      const result = await invoke<{ success: boolean; error?: string }>('install_pandoc')
      if (result.success) {
        await checkPandoc()
      } else if (result.error === 'NO_BREW') {
        setInstallError(t('pandoc.noHomebrew'))
      } else if (result.error === 'LINUX_MANUAL') {
        setInstallError(t('pandoc.linuxManual'))
      } else {
        setInstallError(result.error || 'Install failed')
      }
    } catch (e) {
      setInstallError(String(e))
    } finally {
      setInstalling(false)
    }
  }, [checkPandoc, t])

  if (status === 'checking') return <>{children}</>
  if (status === 'ready') return <>{children}</>

  const canAutoInstall = platform === 'macos' || platform === 'windows'

  return (
    <>
      {children}
      <Dialog open={status === 'missing'} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-[440px]" onPointerDownOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{t('pandoc.title')}</DialogTitle>
            <DialogDescription>{t('pandoc.desc')}</DialogDescription>
          </DialogHeader>

          <div className="py-3">
            <pre className="text-xs bg-muted p-3 rounded-md whitespace-pre-wrap select-all">
              {t(INSTALL_TIP_KEYS[platform])}
            </pre>

            {installError && (
              <p className="text-xs text-destructive mt-2">{installError}</p>
            )}
          </div>

          <DialogFooter className="gap-2">
            {canAutoInstall && (
              <Button onClick={handleAutoInstall} disabled={installing}>
                {installing && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {installing ? t('pandoc.installing') : t('pandoc.autoInstall')}
              </Button>
            )}
            <Button variant="outline" onClick={checkPandoc}>
              {t('pandoc.recheck')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
