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
