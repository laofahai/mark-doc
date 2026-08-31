import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DocumentCommandBar } from '../DocumentCommandBar'

const baseActions = {
  onNew: vi.fn(),
  onSave: vi.fn(),
  onExportMd: vi.fn(),
  onExportDocx: vi.fn(),
  onOpen: vi.fn(),
  onOpenFolder: vi.fn(),
  hasActiveDocument: true,
  pageWidth: 'normal' as const,
  onPageWidthChange: vi.fn(),
  recentFiles: [],
  openFileFromPath: vi.fn(),
  removeRecentFile: vi.fn(),
  clearRecentFiles: vi.fn(),
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'toolbar.documentCommands': 'Document commands',
      'toolbar.file': 'File',
      'toolbar.save': 'Save',
      'toolbar.pageWidth': 'Page Width',
      'toolbar.export': 'Export',
      'toolbar.exportMd': 'Export MD',
      'toolbar.exportDocx': 'Export DOCX',
    }[key] ?? key),
  }),
}))

describe('DocumentCommandBar', () => {
  it('renders compact document commands for the header', () => {
    render(<DocumentCommandBar actions={baseActions} />)

    const commandBar = screen.getByRole('toolbar', { name: 'Document commands' })
    expect(commandBar).toHaveClass('document-command-bar', 'document-command-bar--header')
    expect(commandBar).toContainElement(screen.getByRole('button', { name: 'File' }))
    expect(commandBar).toContainElement(screen.getByRole('button', { name: 'Save' }))
    expect(commandBar).toContainElement(screen.getByRole('button', { name: 'Page Width' }))
  })

  it('keeps file commands visible and hides document-only commands without an active document', () => {
    render(<DocumentCommandBar actions={{ ...baseActions, hasActiveDocument: false }} />)

    const commandBar = screen.getByRole('toolbar', { name: 'Document commands' })
    expect(commandBar).toContainElement(screen.getByRole('button', { name: 'File' }))
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Page Width' })).not.toBeInTheDocument()
  })

  it.each([
    ['normal', 'lucide-rectangle-horizontal'],
    ['wide', 'lucide-stretch-horizontal'],
    ['full', 'lucide-maximize-2'],
  ] as const)('renders the %s page width icon on the header button', (pageWidth, iconClass) => {
    render(<DocumentCommandBar actions={{ ...baseActions, pageWidth }} />)

    const widthButton = screen.getByRole('button', { name: 'Page Width' })
    expect(widthButton.querySelector(`.${iconClass}`)).toBeInTheDocument()
  })

  it('saves and opens export choices from the command bar', () => {
    const actions = { ...baseActions, onSave: vi.fn(), onExportDocx: vi.fn() }
    render(<DocumentCommandBar actions={actions} />)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Export DOCX' }))

    expect(actions.onSave).toHaveBeenCalledOnce()
    expect(actions.onExportDocx).toHaveBeenCalledOnce()
  })

  it('opens header menus downward', () => {
    render(<DocumentCommandBar actions={baseActions} />)

    fireEvent.click(screen.getByRole('button', { name: 'Export' }))

    expect(screen.getByRole('menu')).toHaveAttribute('data-placement', 'bottom-end')
  })
})
