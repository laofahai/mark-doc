import { getEditorOutline } from '../editor-core/outline'

export interface SidebarOutlineItem {
  id: string
  level: number
  text: string
  line: number
  index: number
}

export function getSidebarOutline(markdown: string): SidebarOutlineItem[] {
  return getEditorOutline(markdown).map((item, index) => ({ ...item, index }))
}

export function visibleSidebarOutline(items: SidebarOutlineItem[], collapsedIds: Set<string>) {
  const visible: SidebarOutlineItem[] = []
  let collapsedLevel: number | null = null
  for (const item of items) {
    if (collapsedLevel !== null && item.level > collapsedLevel) continue
    collapsedLevel = collapsedIds.has(item.id) ? item.level : null
    visible.push(item)
  }
  return visible
}
