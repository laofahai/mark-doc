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
})
