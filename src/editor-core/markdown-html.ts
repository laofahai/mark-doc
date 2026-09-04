import type { JSONContent } from '@tiptap/core'

const HTML_ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(["'])(.*?)\2/g
const HTML_IMAGE_RE = /<img\b[^>]*>/gi
const HTML_IMG_TAG_RE = /^<img\b([^>]*)>$/i
const STYLE_VALUE_MAX_LENGTH = 80

export interface StyledElementMatch {
  raw: string
  tagName: 'span' | 'mark'
  text: string
  color: string
}

export function parseHtmlAttributes(source: string) {
  const attrs = new Map<string, string>()
  let match: RegExpExecArray | null
  const attrRe = new RegExp(HTML_ATTR_RE)
  while ((match = attrRe.exec(source)) !== null) {
    attrs.set(match[1].toLowerCase(), match[3])
  }
  return attrs
}

export function cleanStyleValue(value: string | undefined) {
  const cleaned = value?.trim().replace(/^['"]|['"]$/g, '') ?? ''
  if (!cleaned || cleaned.length > STYLE_VALUE_MAX_LENGTH) return null
  if (/[<>"`;]/.test(cleaned)) return null
  return cleaned
}

export function extractStyleValue(style: string | undefined, property: string) {
  if (!style) return null
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = style.match(new RegExp(`(?:^|;)\\s*${escaped}\\s*:\\s*([^;]+)`, 'i'))
  return match ? cleanStyleValue(match[1]) : null
}

export function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeImageAlt(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\]/g, '\\]')
}

function escapeImageTitle(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function imageTagToMarkdown(tag: string) {
  const match = tag.match(HTML_IMG_TAG_RE)
  if (!match) return tag
  const attrs = parseHtmlAttributes(match[1])
  const src = attrs.get('src')?.trim()
  if (!src) return tag

  const titleParts = [
    attrs.get('title')?.trim(),
    attrs.get('width') ? `width=${attrs.get('width')}` : null,
    attrs.get('height') ? `height=${attrs.get('height')}` : null,
  ]
  const style = attrs.get('style')
  const styleWidth = extractStyleValue(style, 'width')
  const styleHeight = extractStyleValue(style, 'height')
  if (styleWidth && !attrs.get('width')) titleParts.push(`width=${styleWidth}`)
  if (styleHeight && !attrs.get('height')) titleParts.push(`height=${styleHeight}`)

  const alt = escapeImageAlt(attrs.get('alt')?.trim() || 'image')
  const title = titleParts.filter((part): part is string => Boolean(part)).join(';')
  return title ? `![${alt}](${src} "${escapeImageTitle(title)}")` : `![${alt}](${src})`
}

export function normalizeHtmlImagesForMarkdown(markdown: string) {
  let fenced = false
  return markdown.split('\n').map(line => {
    if (/^\s{0,3}(```|~~~)/.test(line)) {
      fenced = !fenced
      return line
    }
    return fenced || /^ {4}/.test(line) ? line : line.replace(HTML_IMAGE_RE, tag => imageTagToMarkdown(tag))
  }).join('\n')
}

export function matchStyledElementAtStart(source: string): StyledElementMatch | null {
  const match = source.match(/^<(span|mark)\b([^>]*)>([\s\S]*?)<\/\1>/i)
  if (!match) return null
  const parsedTagName = match[1].toLowerCase() as 'span' | 'mark'
  const attrs = parseHtmlAttributes(match[2])
  const style = attrs.get('style')
  const textColor = parsedTagName === 'span' ? extractStyleValue(style, 'color') : null
  const backgroundColor = parsedTagName === 'span'
    ? extractStyleValue(style, 'background-color')
    : cleanStyleValue(attrs.get('data-color')) ?? extractStyleValue(style, 'background-color')
  const color = textColor ?? backgroundColor
  if (!color) return null

  return {
    raw: match[0],
    tagName: textColor ? 'span' : 'mark',
    text: match[3],
    color,
  }
}

export function addMarkToInlineContent(
  content: JSONContent[],
  mark: { type: string; attrs?: Record<string, unknown> },
): JSONContent[] {
  return content.map(node => {
    if (node.type === 'text') {
      return {
        ...node,
        marks: [...(node.marks ?? []), mark],
      }
    }
    return node.content ? { ...node, content: addMarkToInlineContent(node.content, mark) } : node
  })
}
