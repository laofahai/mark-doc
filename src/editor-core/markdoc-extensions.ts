import { Markdown } from '@tiptap/markdown'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import { Table } from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import Placeholder from '@tiptap/extension-placeholder'
import StarterKit from '@tiptap/starter-kit'
import {
  Extension,
  Node,
  type JSONContent,
  type MarkdownLexerConfiguration,
  type MarkdownParseHelpers,
  type MarkdownRendererHelpers,
  type MarkdownToken,
} from '@tiptap/core'
import { addMarkToInlineContent, escapeHtmlAttribute, matchStyledElementAtStart } from './markdown-html'

export interface MarkDocExtensionOptions {
  placeholder?: string
}

function isAllowedLinkUri(uri: string | undefined) {
  if (!uri) return false
  if (uri.startsWith('#')) return true
  if (uri.startsWith('./') || uri.startsWith('../')) return !uri.split('/').includes('..')
  if (!/^[a-z][a-z0-9+.-]*:/i.test(uri)) return !uri.startsWith('/') && !uri.includes('\\')
  try {
    const parsed = new URL(uri)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:'
  } catch {
    return false
  }
}

interface StyledMarkdownToken extends MarkdownToken {
  markType?: string
  markAttrs?: Record<string, unknown>
}

const MarkDocFrontmatter = Node.create({
  name: 'markDocFrontmatter',
  group: 'block',
  atom: true,
  selectable: false,
  addAttributes() {
    return {
      body: { default: '' },
    }
  },
  parseHTML() {
    return [
      {
        tag: 'pre[data-markdoc-frontmatter]',
        getAttrs: element => ({
          body: element.textContent?.replace(/^---\n?|\n?---$/g, '') ?? '',
        }),
      },
    ]
  },
  renderHTML({ node }) {
    const body = typeof node.attrs.body === 'string' ? node.attrs.body : ''
    return ['pre', { 'data-markdoc-frontmatter': 'true', contenteditable: 'false' }, `---\n${body}\n---`]
  },
  markdownTokenName: 'markDocFrontmatter',
  markdownTokenizer: {
    name: 'markDocFrontmatter',
    level: 'block',
    start: (source: string) => source.startsWith('---\n') ? 0 : -1,
    tokenize(source: string) {
      const match = source.match(/^---\n([\s\S]*?)\n---(?=\n|$)/)
      if (!match) return undefined
      return {
        type: 'markDocFrontmatter',
        raw: match[0],
        text: match[1],
      }
    },
  },
  parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers) {
    return helpers.createNode('markDocFrontmatter', { body: token.text ?? '' })
  },
  renderMarkdown(node: JSONContent) {
    const body = typeof node.attrs?.body === 'string' ? node.attrs.body.replace(/\n+$/g, '') : ''
    return `---\n${body}\n---`
  },
})

function styledElementMark(match: { tagName: 'span' | 'mark'; color: string }) {
  return match.tagName === 'span'
    ? { type: 'textStyle', attrs: { color: match.color } }
    : { type: 'highlight', attrs: { color: match.color } }
}

function styledElementToken(source: string, inlineTokens: (source: string) => MarkdownToken[]) {
  const match = matchStyledElementAtStart(source)
  if (!match) return undefined
  const mark = styledElementMark(match)
  return {
    type: 'markDocStyledElement',
    raw: match.raw,
    text: match.text,
    tokens: inlineTokens(match.text),
    markType: mark.type,
    markAttrs: mark.attrs,
  }
}

const MarkDocStyledInline = Extension.create({
  name: 'markDocStyledInline',
  priority: 1000,
  markdownTokenName: 'markDocStyledElement',
  markdownTokenizer: {
    name: 'markDocStyledElement',
    level: 'inline',
    start: (source: string) => {
      const spanIndex = source.indexOf('<span')
      const markIndex = source.indexOf('<mark')
      if (spanIndex < 0) return markIndex
      if (markIndex < 0) return spanIndex
      return Math.min(spanIndex, markIndex)
    },
    tokenize(source: string, _tokens: MarkdownToken[], helpers: MarkdownLexerConfiguration) {
      return styledElementToken(source, helpers.inlineTokens)
    },
  },
  parseMarkdown(token: StyledMarkdownToken, helpers: MarkdownParseHelpers) {
    return helpers.applyMark(
      token.markType ?? 'textStyle',
      helpers.parseInline(token.tokens ?? []),
      token.markAttrs,
    )
  },
})

const MarkDocStyledBlock = Extension.create({
  name: 'markDocStyledBlock',
  priority: 1000,
  markdownTokenName: 'markDocStyledBlock',
  markdownTokenizer: {
    name: 'markDocStyledBlock',
    level: 'block',
    start: (source: string) => {
      const trimmedStart = source.trimStart()
      const offset = source.length - trimmedStart.length
      return /^<(span|mark)\b/i.test(trimmedStart) ? offset : -1
    },
    tokenize(source: string, _tokens: MarkdownToken[], helpers: MarkdownLexerConfiguration) {
      const trimmedStart = source.trimStart()
      const offset = source.length - trimmedStart.length
      const token = styledElementToken(trimmedStart, helpers.inlineTokens)
      if (!token) return undefined
      return { ...token, type: 'markDocStyledBlock', raw: source.slice(0, offset) + token.raw }
    },
  },
  parseMarkdown(token: StyledMarkdownToken, helpers: MarkdownParseHelpers) {
    const mark = { type: token.markType ?? 'textStyle', attrs: token.markAttrs }
    return helpers.createNode('paragraph', {}, addMarkToInlineContent(helpers.parseInline(token.tokens ?? []), mark))
  },
})

const MarkDocTextStyle = TextStyle.extend({
  renderMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers) {
    const color = typeof node.attrs?.color === 'string' ? node.attrs.color : ''
    const children = helpers.renderChildren(node)
    return color ? `<span style="color: ${escapeHtmlAttribute(color)}">${children}</span>` : children
  },
})

const MarkDocHighlight = Highlight.extend({
  renderMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers) {
    const color = typeof node.attrs?.color === 'string' ? node.attrs.color : ''
    const children = helpers.renderChildren(node)
    return color
      ? `<mark data-color="${escapeHtmlAttribute(color)}" style="background-color: ${escapeHtmlAttribute(color)}; color: inherit">${children}</mark>`
      : `==${children}==`
  },
})

export function createMarkDocExtensions(options: MarkDocExtensionOptions = {}) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: false,
    }),
    MarkDocFrontmatter,
    MarkDocStyledBlock,
    MarkDocStyledInline,
    Markdown,
    Image.configure({
      allowBase64: false,
      inline: false,
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      markdownLinks: true,
      isAllowedUri: uri => isAllowedLinkUri(uri),
    }),
    Table.configure({
      resizable: false,
    }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    MarkDocTextStyle,
    Color.configure({
      types: [TextStyle.name],
    }),
    MarkDocHighlight.configure({
      multicolor: true,
    }),
    Placeholder.configure({
      placeholder: options.placeholder ?? '',
    }),
  ]
}
