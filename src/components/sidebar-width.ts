export const DEFAULT_SIDEBAR_WIDTH = 220
export const MIN_SIDEBAR_WIDTH = 180
export const MAX_SIDEBAR_WIDTH = 420
export const COMPACT_SHELL_WIDTH = 960
export type EditorViewMode = 'fit' | 'actual' | 'wide'

export function clampSidebarWidth(width: number) {
  if (!Number.isFinite(width)) return DEFAULT_SIDEBAR_WIDTH
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(width)))
}

export function nextSidebarWidth(input: { startWidth: number; startClientX: number; currentClientX: number }) {
  return clampSidebarWidth(input.startWidth + input.currentClientX - input.startClientX)
}

export function isCompactShellWidth(viewportWidth: number) {
  return Number.isFinite(viewportWidth) && viewportWidth < COMPACT_SHELL_WIDTH
}

export function effectiveSidebarWidth(input: { hasSidebarContent: boolean; requestedWidth: number; viewportWidth: number }) {
  if (!input.hasSidebarContent || isCompactShellWidth(input.viewportWidth)) return 0
  return clampSidebarWidth(input.requestedWidth)
}

export function effectiveEditorViewMode(viewMode: EditorViewMode, viewportWidth: number): EditorViewMode {
  return isCompactShellWidth(viewportWidth) ? 'fit' : viewMode
}
