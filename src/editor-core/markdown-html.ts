import type { JSONContent } from '@tiptap/core'
import { MarkdownManager } from '@tiptap/markdown'

const HTML_ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(["'])(.*?)\2/g
const HTML_IMG_TAG_RE = /^<img\b((?:[^"'<>]|"[^"]*"|'[^']*')*)>$/i
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
  if (!/<img\b/i.test(markdown)) return markdown
  return normalizeImageTokens(markdown, imageLexer.instance.lexer(markdown))
}

const imageLexer = new MarkdownManager({ extensions: [] })

interface ImageToken {
  type?: string
  raw?: string
  tokens?: ImageToken[]
  items?: ImageToken[]
  header?: { tokens: ImageToken[] }[]
  rows?: { tokens: ImageToken[] }[][]
}

function normalizeImageTokens(source: string, tokens: ImageToken[]): string {
  let cursor = 0
  let result = ''
  let tableDepth = 0
  for (const token of tokens) {
    if (!token.raw) continue
    const start = source.indexOf(token.raw, cursor)
    // Container tokens can strip quote/list prefixes. Preserve their original source.
    if (start < 0) return source
    result += source.slice(cursor, start)
    let replacement = token.raw
    if (token.type === 'html') {
      // Only standalone image tokens are converted; HTML containers retain HTML children.
      const trimmed = token.raw.trim()
      if (!tableDepth && HTML_IMG_TAG_RE.test(trimmed)) replacement = token.raw.replace(trimmed, () => imageTagToMarkdown(trimmed))
      // HTML blocks may end at blank lines. Track table tags across lexer tokens,
      // consuming quoted attributes and comments so their text cannot change nesting.
      const tags = /<!--[\s\S]*?-->|<\/?([a-z][\w:-]*)\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi
      for (const match of token.raw.matchAll(tags)) {
        if (match[1]?.toLowerCase() !== 'table') continue
        tableDepth = Math.max(0, tableDepth + (match[0].startsWith('</') ? -1 : 1))
      }
    } else if (!tableDepth && token.type !== 'code' && token.type !== 'codespan') {
      const children = token.tokens ?? token.items ?? [
        ...(token.header ?? []).flatMap(cell => cell.tokens),
        ...(token.rows ?? []).flatMap(row => row.flatMap(cell => cell.tokens)),
      ]
      if (children.length) replacement = normalizeImageTokens(token.raw, children)
    }
    result += replacement
    cursor = start + token.raw.length
  }
  return result + source.slice(cursor)
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
