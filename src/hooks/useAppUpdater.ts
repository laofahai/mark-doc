import { useCallback, useEffect, useState } from 'react'
import {
  checkForAppUpdate,
  installAndRestartUpdate,
  type AppUpdateAvailable,
  type AppUpdateDownloadProgress,
} from '../services/update-service'

export type AppUpdaterStatus =
  | 'idle'
  | 'checking'
  | 'upToDate'
  | 'available'
  | 'downloading'
  | 'restarting'
  | 'unsupported'
  | 'error'

export interface UseAppUpdaterOptions {
  autoCheck?: boolean
}

export function useAppUpdater(options: UseAppUpdaterOptions = {}) {
  const [status, setStatus] = useState<AppUpdaterStatus>('idle')
  const [update, setUpdate] = useState<AppUpdateAvailable | null>(null)
  const [progress, setProgress] = useState<AppUpdateDownloadProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  const checkNow = useCallback(async () => {
    setStatus('checking')
    setError(null)
    setProgress(null)

    try {
      const result = await checkForAppUpdate()
      if (result.available) {
        setUpdate(result)
        setStatus('available')
        return result
      }

      setUpdate(null)
      setStatus(result.unsupported ? 'unsupported' : 'upToDate')
      return result
    } catch (checkError) {
      setUpdate(null)
      setStatus('error')
      setError(checkError instanceof Error ? checkError.message : String(checkError))
      return { available: false as const }
    }
  }, [])

  const installAndRestart = useCallback(async () => {
    setStatus('downloading')
    setError(null)

    try {
      await installAndRestartUpdate((nextProgress) => {
        setProgress(nextProgress)
      })
      setStatus('restarting')
    } catch (installError) {
      setStatus('error')
      setError(installError instanceof Error ? installError.message : String(installError))
    }
  }, [])

  useEffect(() => {
    if (options.autoCheck) {
      void checkNow()
    }
  }, [checkNow, options.autoCheck])

  return {
    status,
    update,
    progress,
    error,
    checkNow,
    installAndRestart,
  }
}
