import { describe, expect, it } from 'vitest'
import { effectiveEditorViewMode, effectiveSidebarWidth, clampSidebarWidth, nextSidebarWidth } from '../sidebar-width'

describe('sidebar width', () => {
  it('keeps sidebar width within usable editor bounds', () => {
    expect(clampSidebarWidth(120)).toBe(180)
    expect(clampSidebarWidth(260)).toBe(260)
    expect(clampSidebarWidth(640)).toBe(420)
  })

  it('resizes from the drag start position', () => {
    expect(nextSidebarWidth({ startWidth: 220, startClientX: 300, currentClientX: 360 })).toBe(280)
    expect(nextSidebarWidth({ startWidth: 220, startClientX: 300, currentClientX: 180 })).toBe(180)
  })

  it('collapses the sidebar and uses fit editor view in compact windows', () => {
    expect(effectiveSidebarWidth({ hasSidebarContent: true, requestedWidth: 260, viewportWidth: 900 })).toBe(0)
    expect(effectiveEditorViewMode('wide', 900)).toBe('fit')
  })

  it('keeps user layout choices in regular windows', () => {
    expect(effectiveSidebarWidth({ hasSidebarContent: true, requestedWidth: 260, viewportWidth: 1200 })).toBe(260)
    expect(effectiveSidebarWidth({ hasSidebarContent: false, requestedWidth: 260, viewportWidth: 1200 })).toBe(0)
    expect(effectiveEditorViewMode('fit', 1200)).toBe('fit')
    expect(effectiveEditorViewMode('wide', 1200)).toBe('wide')
  })
})
