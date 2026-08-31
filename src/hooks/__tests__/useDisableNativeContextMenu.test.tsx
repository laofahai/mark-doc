import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useDisableNativeContextMenu } from '../useDisableNativeContextMenu'

describe('useDisableNativeContextMenu', () => {
  it('prevents the native context menu while the app is mounted', () => {
    const { unmount } = renderHook(() => useDisableNativeContextMenu())
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)

    unmount()
    const nextEvent = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    document.dispatchEvent(nextEvent)
    expect(nextEvent.defaultPrevented).toBe(false)
  })
})
