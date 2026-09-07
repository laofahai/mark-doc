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

export function scrollToOutlineTarget(root: ParentNode, markdown: string, id: string) {
  const index = getEditorOutline(markdown).findIndex(item => item.id === id)
  if (index < 0) return false
  const target = root.querySelectorAll<HTMLElement>('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6')[index]
  if (!target) return false
  const canvas = target.closest<HTMLElement>('.markdoc-document-canvas')
  if (canvas) {
    canvas.scrollTo({ top: canvas.scrollTop + target.getBoundingClientRect().top - canvas.getBoundingClientRect().top - 16, behavior: 'smooth' })
  } else {
    target.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
  return true
}
