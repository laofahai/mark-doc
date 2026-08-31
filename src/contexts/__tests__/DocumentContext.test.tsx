import { invoke } from '@tauri-apps/api/core'
import { watch } from '@tauri-apps/plugin-fs'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentService } from '../../services/document/document-service'
import { authorizeDocumentPath, readTextFile } from '../../services/native-file'
import { DocumentProvider, useDocument } from '../DocumentContext'
import type { DocumentEditorAdapter } from '../../components/Editor/editor-adapter'

const saveDocument = vi.fn()
const saveDocumentAsPackage = vi.fn()
const openPath = vi.fn()
const exportDocx = vi.fn()

function editorAdapter(markdown: string): DocumentEditorAdapter {
  return {
    getMarkdown: () => markdown,
    setMarkdown: vi.fn(),
    focus: vi.fn(),
    insertImage: vi.fn(),
    insertAttachment: vi.fn(),
  }
}

vi.mock('../../services/document/document-service', () => ({
  DocumentService: vi.fn(),
}))

vi.mock('../../services/native-file', () => ({
  authorizeDocumentPath: vi.fn(async (path: string) => path),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  removeFile: vi.fn(),
  selectDocumentFile: vi.fn(),
}))

describe('DocumentContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(DocumentService).mockImplementation(function DocumentServiceMock() {
      return { saveDocument, saveDocumentAsPackage, openPath, exportDocx } as unknown as DocumentService
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

  it('saves the current editor markdown even when React document state has not caught up', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DocumentProvider>{children}</DocumentProvider>
    )
    const { result } = renderHook(() => useDocument(), { wrapper })
    saveDocument.mockImplementationOnce(async document => ({
      ok: true,
      value: {
        ...document,
        source: { type: 'package', packagePath: '/docs/live.mdoc', extractedWorkspacePath: '/tmp/live' },
        dirty: { markdown: false, assets: false, presentation: false },
      },
    }))

    act(() => result.current.createNewDocument())
    const documentId = result.current.activeDocument!.id
    act(() => result.current.registerDocumentEditor(documentId, editorAdapter('# Live editor draft')))

    await act(async () => { await result.current.saveActiveDocument() })

    expect(saveDocument).toHaveBeenCalledWith(expect.objectContaining({
      id: documentId,
      markdown: '# Live editor draft',
      dirty: expect.objectContaining({ markdown: true }),
    }))
    expect(result.current.activeDocument?.markdown).toBe('# Live editor draft')
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

  it('keeps a recovery draft when explicit mdoc save-as fails', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => <DocumentProvider>{children}</DocumentProvider>
    const { result } = renderHook(() => useDocument(), { wrapper })
    saveDocumentAsPackage.mockResolvedValueOnce({ ok: false, error: { code: 'save.failed', messageKey: 'errors.save.failed' } })

    act(() => result.current.createNewDocument())
    act(() => result.current.setActiveMarkdown('# Package draft'))
    await act(async () => { await result.current.saveActiveDocumentAsPackage() })
    const recoveryDocumentId = result.current.activeDocument!.id

    expect(result.current.recoveryState?.documentId).toBe(recoveryDocumentId)
    vi.mocked(readTextFile).mockResolvedValueOnce('# Package draft')
    await act(async () => { await result.current.restoreRecovery(recoveryDocumentId) })

    expect(result.current.activeDocument?.markdown).toBe('# Package draft')
    expect(result.current.recoveryState).toBeNull()
  })

  it('keeps the default security policy identity stable across document edits', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => <DocumentProvider>{children}</DocumentProvider>
    const { result } = renderHook(() => useDocument(), { wrapper })

    act(() => result.current.createNewDocument())
    const defaultPolicy = result.current.activeSecurityPolicy

    act(() => result.current.setActiveMarkdown('# Edited'))

    expect(result.current.activeSecurityPolicy).toBe(defaultPolicy)
    act(() => result.current.allowActiveRemoteResourceType('image'))
    expect(result.current.activeSecurityPolicy).not.toBe(defaultPolicy)
  })

  it('stores pasted screenshots as package assets and marks Ctrl+S for mdoc save', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => <DocumentProvider>{children}</DocumentProvider>
    const { result } = renderHook(() => useDocument(), { wrapper })
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'screenshot.png', { type: 'image/png' })

    act(() => result.current.createNewDocument())
    let assetPath: string | null = null
    await act(async () => { assetPath = await result.current.importActiveImageAsset(file) })

    expect(assetPath).toMatch(/^assets\/pasted-\d+-[a-z0-9]+\.png$/)
    expect(invoke).toHaveBeenCalledWith('write_pasted_asset', {
      path: expect.stringMatching(/^\/tmp\/markdoc\/paste-document-\d+-\d+-[a-z0-9]+\/assets\/pasted-\d+-[a-z0-9]+\.png$/),
      bytes: [137, 80, 78, 71],
    })
    expect(result.current.activeDocument?.assets.references).toEqual([assetPath])
    expect(result.current.activeDocument?.dirty.assets).toBe(true)
    expect(result.current.activeSaveDecision?.defaultKind).toBe('mdoc')
    expect(result.current.activeSaveDecision?.requiresDialog).toBe(true)
  })

  it('stores pasted screenshot assets when the clipboard file has no MIME type', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => <DocumentProvider>{children}</DocumentProvider>
    const { result } = renderHook(() => useDocument(), { wrapper })
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'Screenshot 2026-08-14 at 14.28.57.png', { type: '' })

    act(() => result.current.createNewDocument())
    let assetPath: string | null = null
    await act(async () => { assetPath = await result.current.importActiveImageAsset(file) })

    expect(assetPath).toMatch(/^assets\/pasted-\d+-[a-z0-9]+\.png$/)
    expect(invoke).toHaveBeenCalledWith('write_pasted_asset', {
      path: expect.stringMatching(/\/assets\/pasted-\d+-[a-z0-9]+\.png$/),
      bytes: [137, 80, 78, 71],
    })
    expect(result.current.activeDocument?.assets.references).toEqual([assetPath])
    expect(result.current.activeDocument?.dirty.assets).toBe(true)
  })

  it('suggests saving markdown as mdoc when editing introduces inline base64 images', async () => {
    openPath.mockResolvedValueOnce({
      ok: true,
      value: {
        document: {
          id: 'base64-doc',
          source: { type: 'markdown', path: '/docs/report.md' },
          workspace: {
            id: 'base64-workspace',
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
    act(() => result.current.setActiveMarkdown('![screenshot](data:image/png;base64,AQID)'))

    expect(result.current.resourceSuggestion).toEqual({
      kind: 'suggest-mdoc',
      references: ['inline-base64-image'],
    })
    expect(result.current.activeSaveDecision?.defaultKind).toBe('mdoc')
    expect(result.current.activeSaveDecision?.requiresDialog).toBe(true)
  })

  it('suggests saving markdown as mdoc when editing introduces embedded local resources', async () => {
    openPath.mockResolvedValueOnce({
      ok: true,
      value: {
        document: {
          id: 'local-resource-doc',
          source: { type: 'markdown', path: '/docs/report.md' },
          workspace: {
            id: 'local-resource-workspace',
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
    act(() => result.current.setActiveMarkdown([
      '# Report',
      '',
      '![diagram](assets/diagram.png)',
      '<link rel="stylesheet" href="./styles/report.css">',
    ].join('\n')))

    expect(result.current.resourceSuggestion).toEqual({
      kind: 'suggest-mdoc',
      references: ['assets/diagram.png', './styles/report.css'],
    })
    expect(result.current.activeSaveDecision).toMatchObject({
      defaultKind: 'markdown',
      requiresDialog: false,
    })
  })

  it('does not suggest mdoc when markdown editing only adds formatting and links', async () => {
    openPath.mockResolvedValueOnce({
      ok: true,
      value: {
        document: {
          id: 'plain-edit-doc',
          source: { type: 'markdown', path: '/docs/report.md' },
          workspace: {
            id: 'plain-edit-workspace',
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
    act(() => result.current.setActiveMarkdown([
      '# Report',
      '',
      '**bold** and <span style="color: #ef4444">red text</span>',
      '[relative doc](notes/next.md)',
    ].join('\n')))

    expect(result.current.resourceSuggestion).toBeNull()
    expect(result.current.activeSaveDecision).toMatchObject({
      defaultKind: 'markdown',
      requiresDialog: false,
    })
  })

  it('keeps existing markdown with local resources on in-place save while showing an mdoc suggestion', async () => {
    openPath.mockResolvedValueOnce({
      ok: true,
      value: {
        document: {
          id: 'resource-doc',
          source: { type: 'markdown', path: '/docs/report.md' },
          workspace: {
            id: 'resource-workspace',
            rootPath: '/docs',
            entryPath: '/docs/report.md',
            storage: { type: 'virtual-markdown', markdownPath: '/docs/report.md' },
          },
          markdown: '![diagram](assets/diagram.png)',
          metadata: {},
          assets: { references: ['assets/diagram.png'] },
          presentation: {},
          dirty: { markdown: false, assets: false, presentation: false },
        },
        resourceSuggestion: {
          kind: 'suggest-mdoc',
          references: ['assets/diagram.png'],
        },
      },
    })
    const wrapper = ({ children }: { children: React.ReactNode }) => <DocumentProvider>{children}</DocumentProvider>
    const { result } = renderHook(() => useDocument(), { wrapper })

    await act(async () => { await result.current.openFileFromPath('/docs/report.md', 'report.md') })
    act(() => result.current.setActiveMarkdown('![diagram](assets/diagram.png)\n\nEdited'))

    expect(result.current.resourceSuggestion).toEqual({
      kind: 'suggest-mdoc',
      references: ['assets/diagram.png'],
    })
    expect(result.current.activeSaveDecision).toMatchObject({
      defaultKind: 'markdown',
      requiresDialog: false,
    })
  })

  it('does not show a previous document mdoc suggestion on clean new documents', async () => {
    openPath.mockResolvedValueOnce({
      ok: true,
      value: {
        document: {
          id: 'base64-doc',
          source: { type: 'markdown', path: '/docs/report.md' },
          workspace: {
            id: 'base64-workspace',
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
    act(() => result.current.setActiveMarkdown('![screenshot](data:image/png;base64,AQID)'))
    expect(result.current.resourceSuggestion?.kind).toBe('suggest-mdoc')

    act(() => result.current.createNewDocument())

    expect(result.current.resourceSuggestion).toBeNull()
    expect(result.current.activeSaveDecision?.defaultKind).toBe('mdoc')
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

    expect(authorizeDocumentPath).toHaveBeenCalledWith('/docs/report.mdoc')
    expect(openPath).toHaveBeenCalledWith('/docs/report.mdoc')
    expect(result.current.activeDocument?.source.type).toBe('package')
  })

  it('does not open a direct path when backend authorization fails', async () => {
    vi.mocked(authorizeDocumentPath).mockRejectedValueOnce('fileAccess.denied')
    const wrapper = ({ children }: { children: React.ReactNode }) => <DocumentProvider>{children}</DocumentProvider>
    const { result } = renderHook(() => useDocument(), { wrapper })

    await act(async () => { await result.current.openFileFromPath('/Users/laofahai/Desktop/untitled.mdoc', 'untitled.mdoc') })

    expect(openPath).not.toHaveBeenCalled()
    expect(result.current.documentError).toMatchObject({
      code: 'open.failed',
      messageKey: 'errors.open.failed',
      params: { path: '/Users/laofahai/Desktop/untitled.mdoc' },
    })
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

  it('does not treat delayed watch notifications from its own save as external changes', async () => {
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(10_000)
    let notifyExternalChange: (() => void) | undefined
    vi.mocked(watch).mockImplementationOnce(async (_path, callback) => {
      notifyExternalChange = () => callback({ type: 'modify', paths: ['/docs/report.mdoc'], attrs: {} })
      return vi.fn()
    })
    openPath.mockResolvedValueOnce({
      ok: true,
      value: {
        document: {
          id: 'watched-package',
          source: { type: 'package', packagePath: '/docs/report.mdoc', extractedWorkspacePath: '/tmp/report' },
          workspace: {
            id: 'watched-workspace',
            rootPath: '/tmp/report',
            entryPath: '/tmp/report/document.md',
            storage: { type: 'temporary', rootPath: '/tmp/report', recoveryKey: 'watched-package' },
          },
          markdown: '# Report',
          metadata: {},
          assets: { references: [] },
          presentation: {},
          dirty: { markdown: false, assets: false, presentation: false },
        },
      },
    })
    saveDocument.mockImplementationOnce(async document => ({
      ok: true,
      value: { ...document, dirty: { markdown: false, assets: false, presentation: false } },
    }))
    const wrapper = ({ children }: { children: React.ReactNode }) => <DocumentProvider>{children}</DocumentProvider>
    const { result } = renderHook(() => useDocument(), { wrapper })

    await act(async () => { await result.current.openFileFromPath('/docs/report.mdoc', 'report.mdoc') })
    await waitFor(() => expect(watch).toHaveBeenCalledWith('/docs/report.mdoc', expect.any(Function), { delayMs: 500 }))
    await act(async () => { await result.current.saveActiveDocument() })
    now.mockReturnValue(12_500)
    act(() => notifyExternalChange?.())

    expect(result.current.activeExternalChange).toBeNull()
    now.mockRestore()
  })
})
