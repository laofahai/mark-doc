import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { selectSavePath } from '../../services/native-file'
import { ExportDocxDialog } from '../ExportDocxDialog'

vi.mock('@linch-tech/desktop-core', () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) => open ? <div>{children}</div> : null,
  DialogContent: (props: HTMLAttributes<HTMLDivElement>) => <div {...props} />,
  DialogHeader: (props: HTMLAttributes<HTMLDivElement>) => <div {...props} />,
  DialogFooter: (props: HTMLAttributes<HTMLDivElement>) => <div {...props} />,
  DialogTitle: (props: HTMLAttributes<HTMLHeadingElement>) => <h2 {...props} />,
  Label: (props: HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Button: ({ children, onClick, disabled }: ButtonHTMLAttributes<HTMLButtonElement>) => <button onClick={onClick} disabled={disabled}>{children}</button>,
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('../../services/native-file', () => ({ selectSavePath: vi.fn(), selectDocumentFile: vi.fn() }))

function setup() {
  const onExport = vi.fn()
  const onOpenChange = vi.fn()
  render(<ExportDocxDialog open onExport={onExport} onOpenChange={onOpenChange}
    defaultFileName="report.docx" currentFilePath="/docs/report.docx" originalDocxPath="/docs/report.docx" />)
  return { onExport, onOpenChange, exportButton: screen.getByRole('button', { name: 'common.export' }) }
}

describe('ExportDocxDialog output confirmation', () => {
  beforeEach(() => { vi.resetAllMocks(); localStorage.clear() })

  it('waits for native confirmation even when the default output is the source DOCX', async () => {
    let confirm!: (path: string | null) => void
    vi.mocked(selectSavePath).mockReturnValue(new Promise(resolve => { confirm = resolve }))
    const { onExport, onOpenChange, exportButton } = setup()
    fireEvent.click(exportButton)
    expect(selectSavePath).toHaveBeenCalledWith({ defaultPath: '/docs/report.docx', filters: [{ name: 'fileFilters.word', extensions: ['docx'] }] })
    expect(onExport).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
    fireEvent.click(exportButton)
    expect(selectSavePath).toHaveBeenCalledTimes(1)
    await act(async () => { confirm('/docs/report.docx') })
    expect(onExport).toHaveBeenCalledExactlyOnceWith({ type: 'builtin', id: 'daily' }, '/docs/report.docx')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('keeps the export dialog open and writes nothing when native save is cancelled', async () => {
    vi.mocked(selectSavePath).mockResolvedValue(null)
    const { onExport, onOpenChange, exportButton } = setup()
    fireEvent.click(exportButton)
    await waitFor(() => expect(selectSavePath).toHaveBeenCalledOnce())
    expect(onExport).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(exportButton).toBeEnabled()
  })

  it('exports to the confirmed path using the chosen template', async () => {
    vi.mocked(selectSavePath).mockResolvedValue('/exports/final.DOCX')
    const { onExport, exportButton } = setup()
    fireEvent.click(screen.getByText('export.formalTemplate'))
    fireEvent.click(exportButton)
    await waitFor(() => expect(onExport).toHaveBeenCalledWith({ type: 'builtin', id: 'formal' }, '/exports/final.DOCX'))
    expect(localStorage.getItem('mark-doc-last-export-dir')).toBe('/exports')
  })

  it('confirms the final filename again before appending a DOCX extension', async () => {
    vi.mocked(selectSavePath).mockResolvedValueOnce('/exports/report').mockResolvedValueOnce(null)
    const { onExport, exportButton } = setup()
    fireEvent.click(exportButton)
    await waitFor(() => expect(selectSavePath).toHaveBeenCalledTimes(2))
    expect(selectSavePath).toHaveBeenLastCalledWith(expect.objectContaining({ defaultPath: '/exports/report.docx' }))
    expect(onExport).not.toHaveBeenCalled()
    vi.mocked(selectSavePath).mockResolvedValue('/exports/report.docx')
    fireEvent.click(exportButton)
    await waitFor(() => expect(onExport).toHaveBeenCalledWith(expect.anything(), '/exports/report.docx'))
  })

  it('reconfirms at export time after choosing an output location earlier', async () => {
    vi.mocked(selectSavePath).mockResolvedValueOnce('/exports/chosen.docx').mockResolvedValueOnce(null)
    const { onExport, exportButton } = setup()
    fireEvent.click(screen.getByText('/docs/report.docx'))
    await screen.findByText('/exports/chosen.docx')
    fireEvent.click(exportButton)
    await waitFor(() => expect(selectSavePath).toHaveBeenCalledTimes(2))
    expect(selectSavePath).toHaveBeenLastCalledWith(expect.objectContaining({ defaultPath: '/exports/chosen.docx' }))
    expect(onExport).not.toHaveBeenCalled()
  })

  it('reports a failed native dialog and allows retry without exporting', async () => {
    vi.mocked(selectSavePath).mockRejectedValueOnce(new Error('Dialog unavailable'))
    const { onExport, onOpenChange, exportButton } = setup()
    fireEvent.click(exportButton)
    expect(await screen.findByRole('alert')).toHaveTextContent('errors.export.docxFailed')
    expect(onExport).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(exportButton).toBeEnabled()
    vi.mocked(selectSavePath).mockResolvedValue('/exports/retry.docx')
    fireEvent.click(exportButton)
    await waitFor(() => expect(onExport).toHaveBeenCalledWith(expect.anything(), '/exports/retry.docx'))
  })
})
