import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentProvider, useDocument } from '../../contexts/DocumentContext'
import { DocumentService } from '../../services/document/document-service'
import type { DocumentModel } from '../../services/document/model'
import { selectSavePath, writeTextFile } from '../../services/native-file'
import { useDocumentCommandActions } from '../useDocumentCommandActions'
import type { TemplateChoice } from '../../components/ExportDocxDialog'
import type { ReactNode, ButtonHTMLAttributes } from 'react'

vi.mock('@linch-tech/desktop-core', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <div>{children}</div> : null,
  DialogContent: 'div', DialogHeader: 'div', DialogTitle: 'h2', DialogFooter: 'div', Label: 'label',
  Button: ({ children, onClick, disabled }: ButtonHTMLAttributes<HTMLButtonElement>) => <button onClick={onClick} disabled={disabled}>{children}</button>,
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const saveDocument = vi.fn()
const saveDocumentAsPackage = vi.fn()
const openPath = vi.fn()
const exportDocx = vi.fn()

vi.mock('../../services/document/document-service', () => ({
  DocumentService: vi.fn(),
}))

vi.mock('../../services/native-file', () => ({
  authorizeDocumentPath: vi.fn(async (path: string) => path),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  removeFile: vi.fn(),
  selectDocumentFile: vi.fn(),
  selectSavePath: vi.fn(),
}))

vi.mock('../../components/ExportDocxDialog', () => ({
  ExportDocxDialog: ({ open, onExport }: {
    open: boolean
    onExport: (choice: TemplateChoice, outputPath: string) => void
  }) => open
    ? <>
      <button type="button" onClick={() => onExport({ type: 'builtin', id: 'daily' }, '/exports/report.docx')}>confirm docx export</button>
      <button type="button" onClick={() => onExport({ type: 'builtin', id: 'formal' }, '/exports/report.docx')}>formal export</button>
      <button type="button" onClick={() => onExport({ type: 'original' }, '/exports/report.docx')}>original export</button>
      <button type="button" onClick={() => onExport({ type: 'custom', path: '/docs/custom.docx' }, '/exports/report.docx')}>custom export</button>
    </>
    : null,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

function Harness() {
  const documentContext = useDocument()
  const commands = useDocumentCommandActions({
    viewMode: 'fit',
    onViewModeChange: vi.fn(),
  })

  return (
    <>
      <button type="button" onClick={documentContext.createNewDocument}>create document</button>
      <button type="button" onClick={() => documentContext.setActiveMarkdown('# Draft')}>set markdown</button>
      <button type="button" onClick={commands.actions.onSave}>save command</button>
      <button type="button" onClick={commands.actions.onExportMd}>export markdown</button>
      <button type="button" onClick={commands.actions.onExportDocx}>export docx</button>
      <button
        type="button"
        onClick={() => commands.actions.onPageLayoutChange({
          size: 'a4',
          orientation: 'landscape',
          margins: { top: '18mm', right: '18mm', bottom: '18mm', left: '18mm' },
        })}
      >
        set landscape
      </button>
      <button type="button" onClick={commands.actions.onPrint}>print command</button>
      {commands.exportDialog}
    </>
  )
}

function renderHarness() {
  return render(
    <DocumentProvider>
      <Harness />
    </DocumentProvider>,
  )
}

describe('useDocumentCommandActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.removeItem('docx_template')
    localStorage.removeItem('docx_template_custom_path')
    vi.mocked(DocumentService).mockImplementation(function DocumentServiceMock() {
      return {
        saveDocument,
        saveDocumentAsPackage,
        openPath,
        exportDocx,
      } as unknown as DocumentService
    })
    saveDocument.mockImplementation(async (document: DocumentModel) => ({
      ok: true,
      value: { ...document, dirty: { markdown: false, assets: false, presentation: false } },
    }))
    exportDocx.mockResolvedValue({ ok: true, value: { outputPath: '/exports/report.docx' } })
    vi.mocked(selectSavePath).mockResolvedValue('/exports/report')
  })

  it('routes header save commands through DocumentContext save', async () => {
    renderHarness()
    fireEvent.click(screen.getByRole('button', { name: 'create document' }))
    fireEvent.click(screen.getByRole('button', { name: 'set markdown' }))
    fireEvent.click(screen.getByRole('button', { name: 'save command' }))

    await waitFor(() => expect(saveDocument).toHaveBeenCalledOnce())
    expect(saveDocument).toHaveBeenCalledWith(expect.objectContaining({
      source: { type: 'new' },
      markdown: '# Draft',
    }))
  })

  it('exports the active document as markdown from the header command model', async () => {
    renderHarness()
    fireEvent.click(screen.getByRole('button', { name: 'create document' }))
    fireEvent.click(screen.getByRole('button', { name: 'set markdown' }))
    fireEvent.click(screen.getByRole('button', { name: 'export markdown' }))

    await waitFor(() => expect(writeTextFile).toHaveBeenCalledOnce())
    expect(writeTextFile).toHaveBeenCalledWith('/exports/report.md', '# Draft')
  })

  it('routes DOCX export through DocumentContext export', async () => {
    renderHarness()
    fireEvent.click(screen.getByRole('button', { name: 'create document' }))
    fireEvent.click(screen.getByRole('button', { name: 'export docx' }))
    fireEvent.click(screen.getByRole('button', { name: 'confirm docx export' }))

    await waitFor(() => expect(exportDocx).toHaveBeenCalledWith(
      expect.objectContaining({ source: { type: 'new' } }),
      '/exports/report.docx',
      { type: 'builtin', id: 'daily' },
    ))
  })

  it.each([
    ['formal export', { type: 'builtin', id: 'formal' }],
    ['original export', { type: 'original' }],
    ['custom export', { type: 'custom', path: '/docs/custom.docx' }],
  ])('preserves %s selection through the hook and context', async (label, choice) => {
    renderHarness()
    fireEvent.click(screen.getByRole('button', { name: 'create document' }))
    fireEvent.click(screen.getByRole('button', { name: 'export docx' }))
    fireEvent.click(screen.getByRole('button', { name: label as string }))
    await waitFor(() => expect(exportDocx).toHaveBeenCalledWith(expect.anything(), '/exports/report.docx', choice))
  })

  it('defaults the real dialog to daily even when an original template is available', async () => {
    vi.mocked(selectSavePath).mockResolvedValue('/exports/report.docx')
    const { ExportDocxDialog } = await vi.importActual<typeof import('../../components/ExportDocxDialog')>('../../components/ExportDocxDialog')
    const onExport = vi.fn()
    render(<ExportDocxDialog open onOpenChange={vi.fn()} originalDocxPath="/docs/original.docx" defaultFileName="report.mdoc" onExport={onExport} />)
    fireEvent.click(screen.getByRole('button', { name: 'common.export' }))
    await waitFor(() => expect(onExport).toHaveBeenCalledWith({ type: 'builtin', id: 'daily' }, expect.stringContaining('report.docx')))
    expect(selectSavePath).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: expect.stringContaining('report.docx') }))
    expect(onExport.mock.calls[0][1]).not.toContain('.mdoc.docx')
    fireEvent.click(screen.getByText('export.formalTemplate'))
    fireEvent.click(screen.getByRole('button', { name: 'common.export' }))
    await waitFor(() => expect(onExport).toHaveBeenLastCalledWith({ type: 'builtin', id: 'formal' }, expect.any(String)))
    fireEvent.click(screen.getByText('export.keepOriginalStyle'))
    fireEvent.click(screen.getByRole('button', { name: 'common.export' }))
    await waitFor(() => expect(onExport).toHaveBeenLastCalledWith({ type: 'original' }, expect.any(String)))
  })

  it.each([
    ['custom', '/docs/custom.docx', { type: 'custom', path: '/docs/custom.docx' }],
    ['custom', '/docs/CUSTOM.DOCX', { type: 'custom', path: '/docs/CUSTOM.DOCX' }],
    ['custom', '', { type: 'builtin', id: 'daily' }],
    ['custom', '   ', { type: 'builtin', id: 'daily' }],
    ['custom', '/docs/report.md', { type: 'builtin', id: 'daily' }],
    [null, '/docs/custom.docx', { type: 'builtin', id: 'daily' }],
    [null, null, { type: 'builtin', id: 'daily' }],
  ] as const)('uses only an explicit custom preference with a valid stored path (%s, %s)', async (preference, path, expected) => {
    vi.mocked(selectSavePath).mockResolvedValue('/exports/report.docx')
    if (preference !== null) localStorage.setItem('docx_template', preference)
    if (path !== null) localStorage.setItem('docx_template_custom_path', path)
    const { ExportDocxDialog } = await vi.importActual<typeof import('../../components/ExportDocxDialog')>('../../components/ExportDocxDialog')
    const onExport = vi.fn()
    render(<ExportDocxDialog open onOpenChange={vi.fn()} originalDocxPath="/docs/original.docx" defaultFileName="report.md" onExport={onExport} />)
    fireEvent.click(screen.getByRole('button', { name: 'common.export' }))
    await waitFor(() => expect(onExport).toHaveBeenCalledWith(expected, expect.any(String)))
  })

  it('routes page layout changes through DocumentContext presentation state', async () => {
    renderHarness()
    fireEvent.click(screen.getByRole('button', { name: 'create document' }))
    fireEvent.click(screen.getByRole('button', { name: 'set landscape' }))
    fireEvent.click(screen.getByRole('button', { name: 'save command' }))

    await waitFor(() => expect(saveDocument).toHaveBeenCalledWith(expect.objectContaining({
      presentation: {
        page: {
          size: 'a4',
          orientation: 'landscape',
          margins: { top: '18mm', right: '18mm', bottom: '18mm', left: '18mm' },
        },
      },
      dirty: expect.objectContaining({ presentation: true }),
    })))
  })

  it('routes print through the active document command model', () => {
    const printSpy = vi.fn()
    Object.defineProperty(window, 'print', { configurable: true, value: printSpy })
    renderHarness()
    fireEvent.click(screen.getByRole('button', { name: 'create document' }))
    fireEvent.click(screen.getByRole('button', { name: 'print command' }))

    expect(printSpy).toHaveBeenCalledOnce()
    window.dispatchEvent(new Event('afterprint'))
  })
})
