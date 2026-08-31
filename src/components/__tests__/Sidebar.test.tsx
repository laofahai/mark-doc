import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Sidebar } from '../Sidebar'
import type { DocumentModel } from '../../services/document/model'

const mocks = vi.hoisted(() => ({
  useDocument: vi.fn(),
  readDir: vi.fn(),
  selectDocumentFolder: vi.fn(),
}))

vi.mock('../../contexts/DocumentContext', () => ({
  useDocument: mocks.useDocument,
}))

vi.mock('../../services/native-file', () => ({
  readDir: mocks.readDir,
  selectDocumentFolder: mocks.selectDocumentFolder,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

function markdownDocument(markdown: string): DocumentModel {
  return {
    id: 'doc-1',
    source: { type: 'markdown', path: '/docs/report.md' },
    workspace: {
      id: 'workspace-1',
      rootPath: '/docs',
      entryPath: '/docs/report.md',
      storage: { type: 'virtual-markdown', markdownPath: '/docs/report.md' },
    },
    markdown,
    metadata: {},
    assets: { references: [] },
    presentation: {},
    dirty: { markdown: false, assets: false, presentation: false },
  }
}

function mockDocument(markdown: string) {
  mocks.useDocument.mockReturnValue({
    activeDocument: markdownDocument(markdown),
    activeTabId: 'tab-1',
    tabs: [{ id: 'tab-1', documentId: 'doc-1', name: 'report.md', isDirty: false }],
    openFileFromPath: vi.fn(),
  })
}

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.readDir.mockResolvedValue([])
    mocks.selectDocumentFolder.mockResolvedValue(null)
    HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  it('shows the current document outline by default', async () => {
    mockDocument([
      '# Roadmap',
      '',
      '## Execution',
      '',
      '```md',
      '# Ignored fenced heading',
      '```',
    ].join('\n'))
    const onSidebarStateChange = vi.fn()

    render(<Sidebar onSidebarStateChange={onSidebarStateChange} />)

    expect(screen.getByRole('button', { name: 'sidebar.outline' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Roadmap')).toBeInTheDocument()
    expect(screen.getByText('Execution')).toBeInTheDocument()
    expect(screen.queryByText('H1')).not.toBeInTheDocument()
    expect(screen.queryByText('H2')).not.toBeInTheDocument()
    expect(screen.queryByText('report.md')).not.toBeInTheDocument()
    expect(screen.queryByText('Ignored fenced heading')).not.toBeInTheDocument()
    await waitFor(() => expect(onSidebarStateChange).toHaveBeenLastCalledWith(true))
  })

  it('collapses outline sections and marks the clicked heading as current', () => {
    mockDocument([
      '# Roadmap',
      '## Execution',
      '### Rollout',
      '# Appendix',
    ].join('\n'))

    render(<Sidebar />)

    fireEvent.click(screen.getByRole('button', { name: 'Execution' }))
    expect(screen.getByRole('button', { name: 'Execution' })).toHaveAttribute('aria-current', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'sidebar.collapseHeading: Roadmap' }))
    expect(screen.getByText('Roadmap')).toBeInTheDocument()
    expect(screen.queryByText('Execution')).not.toBeInTheDocument()
    expect(screen.queryByText('Rollout')).not.toBeInTheDocument()
    expect(screen.getByText('Appendix')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'sidebar.expandHeading: Roadmap' }))
    expect(screen.getByText('Execution')).toBeInTheDocument()
  })

  it('toggles all outline sections from the header control', () => {
    mockDocument([
      '# Roadmap',
      '## Execution',
      '# Appendix',
      '## Risks',
    ].join('\n'))

    render(<Sidebar />)

    fireEvent.click(screen.getByRole('button', { name: 'sidebar.collapseAll' }))
    expect(screen.getByText('Roadmap')).toBeInTheDocument()
    expect(screen.queryByText('Execution')).not.toBeInTheDocument()
    expect(screen.getByText('Appendix')).toBeInTheDocument()
    expect(screen.queryByText('Risks')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'sidebar.expandAll' }))
    expect(screen.getByText('Execution')).toBeInTheDocument()
    expect(screen.getByText('Risks')).toBeInTheDocument()
  })

  it('switches between the document outline and the current folder tree', async () => {
    mockDocument('# Roadmap')
    mocks.readDir.mockResolvedValueOnce([
      { name: 'notes.md', path: '/docs/notes.md', isDirectory: false, isFile: true },
    ])

    render(<Sidebar />)
    fireEvent(window, new CustomEvent('mark-doc:file-opened', { detail: '/docs/report.md' }))
    await waitFor(() => expect(mocks.readDir).toHaveBeenCalledWith('/docs'))

    expect(screen.getByText('Roadmap')).toBeInTheDocument()
    expect(screen.queryByText('notes')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'sidebar.files' }))
    expect(await screen.findByText('notes')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'common.closeFolder' }))
    expect(screen.getByRole('button', { name: 'sidebar.outline' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Roadmap')).toBeInTheDocument()
  })

  it('offers an open-folder action from the file tree mode when no folder is open', async () => {
    mockDocument('# Roadmap')
    mocks.selectDocumentFolder.mockResolvedValueOnce('/docs')
    mocks.readDir.mockResolvedValueOnce([
      { name: 'report.md', path: '/docs/report.md', isDirectory: false, isFile: true },
    ])

    render(<Sidebar />)
    fireEvent.click(screen.getByRole('button', { name: 'sidebar.files' }))
    fireEvent.click(screen.getByRole('button', { name: 'sidebar.openFolder' }))

    await waitFor(() => expect(mocks.readDir).toHaveBeenCalledWith('/docs'))
    expect(await screen.findByText('report')).toBeInTheDocument()
  })
})
