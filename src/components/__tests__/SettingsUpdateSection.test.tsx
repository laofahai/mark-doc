import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppUpdater } from '../../hooks/useAppUpdater'
import { SettingsUpdateSection } from '../SettingsUpdateSection'

const checkNow = vi.fn()
const installAndRestart = vi.fn()

vi.mock('../../hooks/useAppUpdater', () => ({
  useAppUpdater: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      const messages: Record<string, string> = {
        'settings.updateTitle': 'Updates',
        'settings.currentVersion': 'Current version {{version}}',
        'settings.checkForUpdates': 'Check for updates',
        'settings.downloadAndRestart': 'Download and restart',
        'settings.updateAvailable': 'Version {{version}} is available',
        'settings.downloadingUpdate': 'Downloading update {{percent}}%',
        'settings.updatesDesktopOnly': 'Updates are available in the desktop app.',
        'settings.updateBlockedByUnsavedChanges': 'Save open documents before updating.',
      }
      return (messages[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, name) => String(values?.[name] ?? ''))
    },
  }),
}))

describe('SettingsUpdateSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAppUpdater).mockReturnValue({
      status: 'idle',
      update: null,
      progress: null,
      error: null,
      checkNow,
      installAndRestart,
    })
  })

  it('checks for updates without repeating the about version', () => {
    render(<SettingsUpdateSection />)

    expect(screen.queryByText(/Current version/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }))

    expect(checkNow).toHaveBeenCalledOnce()
  })

  it.each(['checking', 'restarting'] as const)('disables actions while %s', status => {
    vi.mocked(useAppUpdater).mockReturnValue({ status, update: { available: true, version: '0.2.0' }, progress: null, error: null, checkNow, installAndRestart })
    render(<SettingsUpdateSection />)
    screen.getAllByRole('button').forEach(button => expect(button).toBeDisabled())
    if (status === 'restarting') expect(screen.getByText('settings.restartingUpdate')).toBeInTheDocument()
  })

  it.each(['upToDate', 'error'] as const)('announces %s', status => {
    vi.mocked(useAppUpdater).mockReturnValue({ status, update: null, progress: null, error: 'Offline', checkNow, installAndRestart })
    render(<SettingsUpdateSection />)
    expect(screen.getByText(status === 'error' ? 'settings.updateFailed' : 'settings.upToDate')).toBeInTheDocument()
  })

  it('blocks retry after an installation error when documents are dirty', () => {
    vi.mocked(useAppUpdater).mockReturnValue({ status: 'error', update: { available: true, version: '0.2.0' }, progress: null, error: 'Offline', checkNow, installAndRestart })
    render(<SettingsUpdateSection hasUnsavedDocuments />)
    expect(screen.getByRole('button', { name: 'Download and restart' })).toBeDisabled()
  })

  it('shows a checked release and starts installation from the section', () => {
    vi.mocked(useAppUpdater).mockReturnValue({
      status: 'available',
      update: { available: true, version: '0.2.0', body: 'Release notes' },
      progress: null,
      error: null,
      checkNow,
      installAndRestart,
    })

    render(<SettingsUpdateSection />)

    expect(screen.getByText('Version 0.2.0 is available')).toBeInTheDocument()
    expect(screen.getByText('Release notes')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Download and restart' }))

    expect(installAndRestart).toHaveBeenCalledOnce()
  })

  it('renders deterministic progress text while downloading', () => {
    vi.mocked(useAppUpdater).mockReturnValue({
      status: 'downloading',
      update: { available: true, version: '0.2.0' },
      progress: { downloaded: 5, contentLength: 10 },
      error: null,
      checkNow,
      installAndRestart,
    })

    render(<SettingsUpdateSection />)

    expect(screen.getByText('Downloading update 50%')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
  })

  it('does not call the updater in unsupported renderer environments', () => {
    vi.mocked(useAppUpdater).mockReturnValue({
      status: 'unsupported',
      update: null,
      progress: null,
      error: null,
      checkNow,
      installAndRestart,
    })

    render(<SettingsUpdateSection />)

    expect(screen.getByText('Updates are available in the desktop app.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Check for updates' })).not.toBeInTheDocument()
  })

  it('blocks installation while documents have unsaved changes', () => {
    vi.mocked(useAppUpdater).mockReturnValue({
      status: 'available',
      update: { available: true, version: '0.2.0' },
      progress: null,
      error: null,
      checkNow,
      installAndRestart,
    })

    render(<SettingsUpdateSection hasUnsavedDocuments />)

    expect(screen.getByText('Save open documents before updating.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Download and restart' }))
    expect(installAndRestart).not.toHaveBeenCalled()
  })
})
