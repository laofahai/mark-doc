import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DocumentProvider, useDocument } from '../DocumentContext'

describe('DocumentContext', () => {
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
})
