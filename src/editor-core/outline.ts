export interface EditorOutlineItem {
  id: string
  level: number
  text: string
  line: number
}

function slugify(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '') || 'heading'
}

export function getEditorOutline(markdown: string): EditorOutlineItem[] {
  const items: EditorOutlineItem[] = []
  let inFence = false
  let inFrontmatter = false

  markdown.split(/\r?\n/).forEach((line, index) => {
    if (index === 0 && line === '---') {
      inFrontmatter = true
      return
    }
    if (inFrontmatter) {
      if (line === '---') inFrontmatter = false
      return
    }
    if (/^\s{0,3}(```|~~~)/.test(line)) {
      inFence = !inFence
      return
    }
    if (inFence) return

    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (!match) return

    const text = match[2].trim()
    items.push({
      id: `${slugify(text)}-${index + 1}`,
      level: match[1].length,
      text,
      line: index + 1,
    })
  })

  return items
}

export function outlineSelector(id: string) {
  return `[data-markdoc-outline-id="${CSS.escape(id)}"]`
}

export function scrollToOutlineTarget(root: ParentNode, id: string) {
  const target = root.querySelector<HTMLElement>(outlineSelector(id))
  if (!target) return false
  target.scrollIntoView({ block: 'start', behavior: 'smooth' })
  return true
}
