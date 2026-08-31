import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkForAppUpdate, installAndRestartUpdate } from '../../services/update-service'
import { useAppUpdater } from '../useAppUpdater'

vi.mock('../../services/update-service', () => ({
  checkForAppUpdate: vi.fn(),
  installAndRestartUpdate: vi.fn(),
}))

describe('useAppUpdater', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('stores available release metadata after a successful check', async () => {
    vi.mocked(checkForAppUpdate).mockResolvedValue({
      available: true,
      version: '0.2.0',
      date: '2026-08-31',
      body: 'Release notes',
    })

    const { result } = renderHook(() => useAppUpdater())

    await act(async () => {
      await result.current.checkNow()
    })

    expect(result.current.status).toBe('available')
    expect(result.current.update).toEqual({
      available: true,
      version: '0.2.0',
      date: '2026-08-31',
      body: 'Release notes',
    })
  })

  it('tracks download progress and moves to restart state after installation', async () => {
    vi.mocked(checkForAppUpdate).mockResolvedValue({
      available: true,
      version: '0.2.0',
      body: '',
    })
    vi.mocked(installAndRestartUpdate).mockImplementation(async (onProgress) => {
      onProgress?.({ downloaded: 5, contentLength: 10 })
    })

    const { result } = renderHook(() => useAppUpdater())

    await act(async () => {
      await result.current.checkNow()
      await result.current.installAndRestart()
    })

    expect(result.current.progress).toEqual({ downloaded: 5, contentLength: 10 })
    expect(result.current.status).toBe('restarting')
  })

  it('runs an automatic check when requested', async () => {
    vi.mocked(checkForAppUpdate).mockResolvedValue({ available: false })

    const { result } = renderHook(() => useAppUpdater({ autoCheck: true }))

    await waitFor(() => expect(result.current.status).toBe('upToDate'))
    expect(checkForAppUpdate).toHaveBeenCalledOnce()
  })
})
