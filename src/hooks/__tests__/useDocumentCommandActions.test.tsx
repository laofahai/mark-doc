import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentProvider, useDocument } from '../../contexts/DocumentContext'
import { DocumentService } from '../../services/document/document-service'
import type { DocumentModel } from '../../services/document/model'
import { selectSavePath, writeTextFile } from '../../services/native-file'
import { useDocumentCommandActions } from '../useDocumentCommandActions'

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
    onExport: (choice: { type: 'builtin'; id: string }, outputPath: string) => void
  }) => open
    ? <button type="button" onClick={() => onExport({ type: 'builtin', id: 'default' }, '/exports/report.docx')}>confirm docx export</button>
    : null,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

function Harness() {
  const documentContext = useDocument()
  const commands = useDocumentCommandActions({
    pageWidth: 'normal',
    onPageWidthChange: vi.fn(),
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
      undefined,
    ))
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
