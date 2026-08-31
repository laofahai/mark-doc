import { describe, expect, it } from 'vitest'
import { effectiveEditorPageWidth, effectiveSidebarWidth, clampSidebarWidth, nextSidebarWidth } from '../sidebar-width'

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

  it('collapses the sidebar and uses full editor width in compact windows', () => {
    expect(effectiveSidebarWidth({ hasSidebarContent: true, requestedWidth: 260, viewportWidth: 900 })).toBe(0)
    expect(effectiveEditorPageWidth('wide', 900)).toBe('full')
  })

  it('keeps user layout choices in regular windows', () => {
    expect(effectiveSidebarWidth({ hasSidebarContent: true, requestedWidth: 260, viewportWidth: 1200 })).toBe(260)
    expect(effectiveSidebarWidth({ hasSidebarContent: false, requestedWidth: 260, viewportWidth: 1200 })).toBe(0)
    expect(effectiveEditorPageWidth('normal', 1200)).toBe('normal')
    expect(effectiveEditorPageWidth('wide', 1200)).toBe('wide')
  })
})
