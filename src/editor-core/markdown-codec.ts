import type { JSONContent } from '@tiptap/core'
import { MarkdownManager } from '@tiptap/markdown'
import { createMarkDocExtensions } from './markdoc-extensions'
import { normalizeHtmlImagesForMarkdown } from './markdown-html'
import type { EditorDocument, MarkdownCodec } from './types'

export function normalizeMarkdown(markdown: string) {
  return markdown.replace(/\r\n/g, '\n').replace(/\n+$/g, '')
}

export function prepareMarkdownForEditor(markdown: string) {
  return normalizeHtmlImagesForMarkdown(normalizeMarkdown(markdown))
}

export function createMarkdownCodec(): MarkdownCodec {
  const manager = new MarkdownManager({ extensions: createMarkDocExtensions() })
  return {
    parse(markdown) {
      return manager.parse(prepareMarkdownForEditor(markdown)) as EditorDocument
    },
    serialize(document) {
      return normalizeMarkdown(manager.serialize(document as JSONContent))
    },
    normalize: normalizeMarkdown,
    roundTrip(markdown) {
      return this.serialize(this.parse(markdown))
    },
  }
}
