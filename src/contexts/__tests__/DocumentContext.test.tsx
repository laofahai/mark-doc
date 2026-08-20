import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentService } from '../../services/document/document-service'
import { DocumentProvider, useDocument } from '../DocumentContext'

const saveDocument = vi.fn()

vi.mock('../../services/document/document-service', () => ({
  DocumentService: vi.fn(),
}))

describe('DocumentContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(DocumentService).mockImplementation(function DocumentServiceMock() {
      return { saveDocument } as unknown as DocumentService
    })
  })

  it('creates new document tabs with mdoc default save kind', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DocumentProvider>{children}</DocumentProvider>
    )
    const { result } = renderHook(() => useDocument(), { wrapper })

    act(() => result.current.createNewDocument())

    expect(result.current.tabs).toHaveLength(1)
    expect(result.current.activeDocument?.source.type).toBe('new')
    expect(result.current.activeSaveDecision?.defaultKind).toBe('mdoc')
  })

  it('exposes document-owned open, save, and DOCX export actions', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DocumentProvider>{children}</DocumentProvider>
    )
    const { result } = renderHook(() => useDocument(), { wrapper })

    expect(result.current.openFileFromPath).toEqual(expect.any(Function))
    expect(result.current.saveActiveDocument).toEqual(expect.any(Function))
    expect(result.current.exportActiveDocx).toEqual(expect.any(Function))
    expect(result.current.resourceSuggestion).toBeNull()
    expect(result.current.documentError).toBeNull()
    expect(result.current.dismissResourceSuggestion).toEqual(expect.any(Function))
    expect(result.current.dismissDocumentError).toEqual(expect.any(Function))
  })

  it('marks active document markdown dirty and can clear the active document', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DocumentProvider>{children}</DocumentProvider>
    )
    const { result } = renderHook(() => useDocument(), { wrapper })

    act(() => result.current.createNewDocument())
    act(() => result.current.setActiveMarkdown('# Draft'))

    expect(result.current.activeDocument?.markdown).toBe('# Draft')
    expect(result.current.activeDocument?.dirty.markdown).toBe(true)

    act(() => result.current.clearActiveDocument())

    expect(result.current.activeDocument).toBeNull()
  })

  it('switches and closes document tabs without depending on FileContext', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DocumentProvider>{children}</DocumentProvider>
    )
    const { result } = renderHook(() => useDocument(), { wrapper })

    act(() => result.current.createNewDocument())
    const firstTabId = result.current.activeTabId!
    act(() => result.current.createNewDocument())
    const secondTabId = result.current.activeTabId!

    act(() => result.current.switchDocumentTab(firstTabId))
    expect(result.current.activeTabId).toBe(firstTabId)

    act(() => result.current.closeDocumentTab(firstTabId))

    expect(result.current.tabs.map(tab => tab.id)).toEqual([secondTabId])
    expect(result.current.activeTabId).toBe(secondTabId)
  })

  it('keeps dirty state on inactive document tabs', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DocumentProvider>{children}</DocumentProvider>
    )
    const { result } = renderHook(() => useDocument(), { wrapper })

    act(() => result.current.createNewDocument())
    const dirtyTabId = result.current.activeTabId!
    act(() => result.current.setActiveMarkdown('# Dirty'))
    act(() => result.current.createNewDocument())

    const dirtyTab = result.current.tabs.find(tab => tab.id === dirtyTabId)
    expect(dirtyTab?.isDirty).toBe(true)
  })

  it('restores a failed save snapshot only for the document that owns it', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => <DocumentProvider>{children}</DocumentProvider>
    const { result } = renderHook(() => useDocument(), { wrapper })
    saveDocument.mockResolvedValueOnce({ ok: false, error: { code: 'save.failed', messageKey: 'errors.save.failed' } })

    act(() => result.current.createNewDocument())
    const firstTabId = result.current.activeTabId!
    act(() => result.current.setActiveMarkdown('# Recovery snapshot'))
    await act(async () => { await result.current.saveActiveDocument() })
    const recoveryDocumentId = result.current.activeDocument!.id

    act(() => result.current.setActiveMarkdown('# Changed after failure'))
    act(() => result.current.createNewDocument())
    expect(result.current.recoveryState).toBeNull()

    act(() => result.current.switchDocumentTab(firstTabId))
    expect(result.current.recoveryState?.documentId).toBe(recoveryDocumentId)
    act(() => result.current.restoreRecovery(recoveryDocumentId))

    expect(result.current.activeDocument?.markdown).toBe('# Recovery snapshot')
    expect(result.current.activeDocument?.dirty.markdown).toBe(true)
    expect(result.current.recoveryState).toBeNull()
  })

  it('clears a recovery record after a successful retry and retains per-document policy', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => <DocumentProvider>{children}</DocumentProvider>
    const { result } = renderHook(() => useDocument(), { wrapper })
    saveDocument
      .mockResolvedValueOnce({ ok: false, error: { code: 'save.failed', messageKey: 'errors.save.failed' } })
      .mockImplementationOnce(async document => ({ ok: true, value: { ...document, dirty: { markdown: false, assets: false, presentation: false } } }))

    act(() => result.current.createNewDocument())
    const firstTabId = result.current.activeTabId!
    act(() => result.current.setActiveMarkdown('# Retry'))
    await act(async () => { await result.current.saveActiveDocument() })
    const recoveryDocumentId = result.current.activeDocument!.id

    act(() => result.current.allowActiveRemoteResourceType('image'))
    act(() => result.current.allowActiveRemoteDomain('styles.example.com'))
    act(() => result.current.allowActiveRemoteUrl('https://cdn.example.com/allowed.css'))
    expect(result.current.activeSecurityPolicy?.canLoadRemote('https://example.com/image.png', 'image')).toBe(true)
    expect(result.current.activeSecurityPolicy?.canLoadRemote('https://example.com/style.css', 'style')).toBe(false)
    expect(result.current.activeSecurityPolicy?.canLoadRemote('https://styles.example.com/style.css', 'style')).toBe(true)
    expect(result.current.activeSecurityPolicy?.canLoadRemote('https://cdn.example.com/allowed.css', 'style')).toBe(true)
    act(() => result.current.trustActiveDocument())
    expect(result.current.activeSecurityPolicy?.canLoadRemote('https://example.com/image.png', 'image')).toBe(true)
    await act(async () => { await result.current.retryRecovery(recoveryDocumentId) })
    expect(result.current.recoveryState).toBeNull()

    act(() => result.current.createNewDocument())
    expect(result.current.activeSecurityPolicy?.canLoadRemote('https://example.com/image.png', 'image')).toBe(false)
    act(() => result.current.switchDocumentTab(firstTabId))
    expect(result.current.activeSecurityPolicy?.canLoadRemote('https://example.com/image.png', 'image')).toBe(true)
  })
})
