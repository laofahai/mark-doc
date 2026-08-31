import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkForAppUpdate, installAndRestartUpdate } from '../update-service'

const check = vi.fn()
const relaunch = vi.fn()
const isTauri = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => isTauri(),
}))

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: () => check(),
}))

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: () => relaunch(),
}))

describe('update service', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    isTauri.mockReturnValue(true)
    check.mockResolvedValue(null)
    await checkForAppUpdate()
    vi.clearAllMocks()
    isTauri.mockReturnValue(true)
  })

  it('skips updater calls outside the Tauri runtime', async () => {
    isTauri.mockReturnValue(false)

    await expect(checkForAppUpdate()).resolves.toEqual({ available: false, unsupported: true })
    expect(check).not.toHaveBeenCalled()
  })

  it('reports up to date when the updater has no available release', async () => {
    check.mockResolvedValue(null)

    await expect(checkForAppUpdate()).resolves.toEqual({ available: false })
  })

  it('returns release metadata and stores the pending update for installation', async () => {
    check.mockResolvedValue({
      version: '0.2.0',
      date: '2026-08-31',
      body: 'Release notes',
      downloadAndInstall: vi.fn(),
    })

    await expect(checkForAppUpdate()).resolves.toEqual({
      available: true,
      version: '0.2.0',
      date: '2026-08-31',
      body: 'Release notes',
    })
  })

  it('downloads, installs and relaunches the pending update', async () => {
    const progress = vi.fn()
    const downloadAndInstall = vi.fn(async callback => {
      callback({ event: 'Started', data: { contentLength: 10 } })
      callback({ event: 'Progress', data: { chunkLength: 4 } })
      callback({ event: 'Finished' })
    })
    check.mockResolvedValue({
      version: '0.2.0',
      date: '2026-08-31',
      body: '',
      downloadAndInstall,
    })

    await checkForAppUpdate()
    await installAndRestartUpdate(progress)

    expect(downloadAndInstall).toHaveBeenCalledOnce()
    expect(progress).toHaveBeenCalledWith({ downloaded: 4, contentLength: 10 })
    expect(relaunch).toHaveBeenCalledOnce()
  })

  it('refuses installation when no update has been checked and stored', async () => {
    await expect(installAndRestartUpdate()).rejects.toThrow('No pending update')
    expect(relaunch).not.toHaveBeenCalled()
  })
})
