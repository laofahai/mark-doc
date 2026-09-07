import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_VERSION } from '../../app-version'
import { SettingsDialog } from '../SettingsDialog'
import type { HTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'

const state = vi.hoisted(() => ({ dirty: false }))
vi.mock('@linch-tech/desktop-core', () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) => open ? <div>{children}</div> : null,
  DialogContent: (props: HTMLAttributes<HTMLDivElement>) => <div {...props} />,
  DialogHeader: (props: HTMLAttributes<HTMLDivElement>) => <div {...props} />,
  DialogFooter: (props: HTMLAttributes<HTMLDivElement>) => <div {...props} />,
  DialogTitle: (props: HTMLAttributes<HTMLHeadingElement>) => <h2 {...props} />,
  Label: (props: HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Separator: () => <hr />,
  Button: ({ children, onClick }: ButtonHTMLAttributes<HTMLButtonElement>) => <button onClick={onClick}>{children}</button>,
  ThemeSwitcher: () => <div>Theme</div>,
  LanguageSwitcher: () => <div>Language</div>,
}))
vi.mock('../../contexts/DocumentContext', () => ({
  useDocument: () => ({ tabs: [{ isDirty: state.dirty }] }),
}))
vi.mock('../../services/native-file', () => ({ selectDocumentFile: vi.fn() }))
vi.mock('../../hooks/useAppUpdater', () => ({
  useAppUpdater: () => ({ status: 'available', update: { version: '9.0.0' }, checkNow: vi.fn(), installAndRestart: vi.fn() }),
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

describe('SettingsDialog about', () => {
  beforeEach(() => { state.dirty = false; localStorage.clear() })

  it('separates about from general and retains template settings', () => {
    render(<SettingsDialog open onOpenChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'settings.checkForUpdates' })).not.toBeInTheDocument()
    expect(screen.getByText('settings.presentBy')).not.toBeVisible()
    fireEvent.click(screen.getByRole('tab', { name: 'settings.tabAbout' }))
    expect(screen.getByRole('heading', { name: 'MarkDoc' })).toBeInTheDocument()
    expect(screen.getByRole('tabpanel').querySelector('img')).toHaveAttribute('src', expect.stringContaining('128x128.png'))
    expect(screen.getAllByText(`v${APP_VERSION}`)).toHaveLength(1)
    expect(screen.getByText('settings.aboutDescription')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'MIT' })).toHaveAttribute('href', 'https://github.com/laofahai/mark-doc/blob/main/LICENSE')
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/laofahai/mark-doc')
    expect(screen.getByRole('link', { name: 'settings.website' })).toHaveAttribute('href', 'https://linch.tech/zh/products/mark-doc')
    fireEvent.click(screen.getByRole('tab', { name: 'settings.tabTemplate' }))
    expect(screen.getByText('settings.defaultTemplate')).toBeInTheDocument()
    expect(screen.getByText('settings.selectTemplateFile')).toBeInTheDocument()
  })

  it('passes dirty document protection into about', () => {
    state.dirty = true
    render(<SettingsDialog open onOpenChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'settings.tabAbout' }))
    expect(screen.getByRole('button', { name: 'settings.downloadAndRestart' })).toBeDisabled()
  })

  it('supports keyboard tab navigation and preserves the mounted update area', () => {
    render(<SettingsDialog open onOpenChange={vi.fn()} />)
    const general = screen.getByRole('tab', { name: 'settings.tabGeneral' })
    fireEvent.keyDown(general, { key: 'End' })
    const about = screen.getByRole('tab', { name: 'settings.tabAbout' })
    expect(about).toHaveFocus()
    expect(about).toHaveAttribute('aria-selected', 'true')
    const updateButton = screen.getByRole('button', { name: 'settings.checkForUpdates' })
    fireEvent.keyDown(about, { key: 'Home' })
    expect(updateButton).not.toBeVisible()
    fireEvent.click(about)
    expect(screen.getByRole('button', { name: 'settings.checkForUpdates' })).toBe(updateButton)
  })
})
