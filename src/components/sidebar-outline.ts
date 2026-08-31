export interface SidebarOutlineItem {
  id: string
  level: number
  text: string
  line: number
  index: number
}

function stripHeadingMarkup(value: string) {
  return value
    .replace(/\s+#+\s*$/, '')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isFenceLine(line: string): '`' | '~' | null {
  const match = line.match(/^\s{0,3}(`{3,}|~{3,})/)
  if (!match) return null
  return match[1][0] === '`' ? '`' : '~'
}

function outlineId(text: string, line: number) {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'heading'
  return `${line}-${slug}`
}

export function getSidebarOutline(markdown: string): SidebarOutlineItem[] {
  const items: SidebarOutlineItem[] = []
  const lines = markdown.split(/\r?\n/)
  let fence: '`' | '~' | null = null

  lines.forEach((line, index) => {
    const fenceMarker = isFenceLine(line)
    if (fenceMarker) {
      fence = fence === fenceMarker ? null : fenceMarker
      return
    }
    if (fence) return

    const atx = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*$/)
    if (!atx) return

    const text = stripHeadingMarkup(atx[2])
    if (!text) return
    items.push({
      id: outlineId(text, index + 1),
      level: atx[1].length,
      text,
      line: index + 1,
      index: items.length,
    })
  })

  return items
}
