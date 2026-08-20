import { invoke } from '@tauri-apps/api/core'
import { readTextFile, watch } from '@tauri-apps/plugin-fs'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentService } from '../../services/document/document-service'
import { DocumentProvider, useDocument } from '../DocumentContext'

const saveDocument = vi.fn()
const openPath = vi.fn()
const exportDocx = vi.fn()

vi.mock('../../services/document/document-service', () => ({
  DocumentService: vi.fn(),
}))

describe('DocumentContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(DocumentService).mockImplementation(function DocumentServiceMock() {
      return { saveDocument, openPath, exportDocx } as unknown as DocumentService
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
    expect(result.current.saveDocumentTab).toEqual(expect.any(Function))
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
    vi.mocked(readTextFile).mockResolvedValueOnce('# Recovery snapshot')
    await act(async () => { await result.current.restoreRecovery(recoveryDocumentId) })

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

  it('returns explicit targeted save outcomes for inactive document tabs', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => <DocumentProvider>{children}</DocumentProvider>
    const { result } = renderHook(() => useDocument(), { wrapper })

    act(() => result.current.createNewDocument())
    const firstTabId = result.current.activeTabId!
    act(() => result.current.setActiveMarkdown('# First draft'))
    act(() => result.current.createNewDocument())
    saveDocument
      .mockImplementationOnce(async document => ({
        ok: true,
        value: { ...document, dirty: { markdown: false, assets: false, presentation: false } },
      }))
      .mockResolvedValueOnce({ ok: true, value: null })
      .mockResolvedValueOnce({ ok: false, error: { code: 'save.failed', messageKey: 'errors.save.failed' } })

    await expect(result.current.saveDocumentTab(firstTabId)).resolves.toBe('saved')
    expect(saveDocument).toHaveBeenNthCalledWith(1, expect.objectContaining({ markdown: '# First draft' }))
    await expect(result.current.saveActiveDocument()).resolves.toBe('cancelled')
    await expect(result.current.saveActiveDocument()).resolves.toBe('failed')
  })

  it('routes pending OS-open paths through the document service', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(['/docs/report.mdoc'])
    openPath.mockResolvedValueOnce({
      ok: true,
      value: {
        document: {
          id: 'opened-doc',
          source: { type: 'package', packagePath: '/docs/report.mdoc', extractedWorkspacePath: '/tmp/report' },
          workspace: {
            id: 'opened-workspace',
            rootPath: '/tmp/report',
            entryPath: '/tmp/report/document.md',
            storage: { type: 'temporary', rootPath: '/tmp/report', recoveryKey: 'opened-doc' },
          },
          markdown: '# Opened',
          metadata: {},
          assets: { references: [] },
          presentation: {},
          dirty: { markdown: false, assets: false, presentation: false },
        },
      },
    })
    const wrapper = ({ children }: { children: React.ReactNode }) => <DocumentProvider>{children}</DocumentProvider>
    const { result } = renderHook(() => useDocument(), { wrapper })

    await waitFor(() => expect(result.current.tabs).toHaveLength(1))

    expect(openPath).toHaveBeenCalledWith('/docs/report.mdoc')
    expect(result.current.activeDocument?.source.type).toBe('package')
  })

  it('transitions a watched dirty document into external conflict state', async () => {
    let notifyExternalChange: (() => void) | undefined
    vi.mocked(watch).mockImplementationOnce(async (_path, callback) => {
      notifyExternalChange = () => callback({ type: 'modify', paths: ['/docs/report.md'], attrs: {} })
      return vi.fn()
    })
    openPath.mockResolvedValueOnce({
      ok: true,
      value: {
        document: {
          id: 'watched-doc',
          source: { type: 'markdown', path: '/docs/report.md' },
          workspace: {
            id: 'watched-workspace',
            rootPath: '/docs',
            entryPath: '/docs/report.md',
            storage: { type: 'virtual-markdown', markdownPath: '/docs/report.md' },
          },
          markdown: '# Report',
          metadata: {},
          assets: { references: [] },
          presentation: {},
          dirty: { markdown: false, assets: false, presentation: false },
        },
      },
    })
    const wrapper = ({ children }: { children: React.ReactNode }) => <DocumentProvider>{children}</DocumentProvider>
    const { result } = renderHook(() => useDocument(), { wrapper })

    await act(async () => { await result.current.openFileFromPath('/docs/report.md', 'report.md') })
    await waitFor(() => expect(watch).toHaveBeenCalledWith('/docs/report.md', expect.any(Function), { delayMs: 500 }))
    act(() => result.current.setActiveMarkdown('# Local edit'))
    act(() => notifyExternalChange?.())

    expect(result.current.activeExternalChange?.decision.actions).toEqual(['keepCurrent', 'saveAs', 'discardAndReload'])
  })
})
