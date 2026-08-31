import { isTauri } from '@tauri-apps/api/core'
import { relaunch } from '@tauri-apps/plugin-process'
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater'

export interface AppUpdateAvailable {
  available: true
  version: string
  date?: string
  body?: string
}

export interface AppUpdateUnavailable {
  available: false
  unsupported?: true
}

export type AppUpdateCheckResult = AppUpdateAvailable | AppUpdateUnavailable

export interface AppUpdateDownloadProgress {
  downloaded: number
  contentLength?: number
}

export type AppUpdateProgressHandler = (progress: AppUpdateDownloadProgress) => void

let pendingUpdate: Update | null = null

export async function checkForAppUpdate(): Promise<AppUpdateCheckResult> {
  if (!isTauri()) {
    pendingUpdate = null
    return { available: false, unsupported: true }
  }

  const update = await check()
  pendingUpdate = update

  if (!update) {
    return { available: false }
  }

  return {
    available: true,
    version: update.version,
    date: update.date,
    body: update.body,
  }
}

export async function installAndRestartUpdate(onProgress?: AppUpdateProgressHandler): Promise<void> {
  if (!pendingUpdate) {
    throw new Error('No pending update')
  }

  let downloaded = 0
  let contentLength: number | undefined

  await pendingUpdate.downloadAndInstall((event: DownloadEvent) => {
    if (event.event === 'Started') {
      downloaded = 0
      contentLength = event.data.contentLength
      return
    }

    if (event.event === 'Progress') {
      downloaded += event.data.chunkLength
      onProgress?.({ downloaded, contentLength })
    }
  })

  await relaunch()
}
