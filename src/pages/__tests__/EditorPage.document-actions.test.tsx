import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentProvider } from '../../contexts/DocumentContext'
import { DocumentService } from '../../services/document/document-service'
import type { DocumentModel } from '../../services/document/model'
import { EditorPage } from '../EditorPage'

const saveDocument = vi.fn()
const saveDocumentAsPackage = vi.fn()
const openPath = vi.fn()

vi.mock('../../services/document/document-service', () => ({
  DocumentService: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../components/Editor/Editor', () => ({
  default: ({ content, onChange }: {
    content: string
    onChange: (markdown: string) => void
  }) => (
    <div data-testid="editor">
      <textarea
        aria-label="editor-content"
        value={content}
        onChange={event => onChange(event.currentTarget.value)}
      />
    </div>
  ),
}))

function renderPage() {
  return render(
    <DocumentProvider>
      <EditorPage pageWidth="normal" />
    </DocumentProvider>,
  )
}

describe('EditorPage document actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(DocumentService).mockImplementation(function DocumentServiceMock() {
      return {
        saveDocument,
        saveDocumentAsPackage,
        openPath,
      } as unknown as DocumentService
    })
    saveDocument.mockImplementation(async (document: DocumentModel) => ({
      ok: true,
      value: { ...document, dirty: { markdown: false, assets: false, presentation: false } },
    }))
  })

  it('routes Cmd+S on an active document through DocumentContext save', async () => {
    renderPage()
    fireEvent.click(screen.getAllByRole('button')[0])
    await waitFor(() => expect(screen.getByTestId('editor')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('editor-content'), { target: { value: '# Draft' } })
    fireEvent.keyDown(window, { key: 's', metaKey: true })

    await waitFor(() => expect(saveDocument).toHaveBeenCalledOnce())
    expect(saveDocument).toHaveBeenCalledWith(expect.objectContaining({
      source: { type: 'new' },
      markdown: '# Draft',
    }))
  })
})
