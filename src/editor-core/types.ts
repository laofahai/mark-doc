import type { AssetRef } from '../services/assets/AssetManager'

export type EditorCommand =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'blockquote'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'heading'
  | 'inlineCode'
  | 'codeBlock'
  | 'link'
  | 'image'
  | 'attachment'
  | 'table'
  | 'horizontalRule'
  | 'textColor'
  | 'backgroundColor'
  | 'clearTextColor'
  | 'clearBackgroundColor'
  | 'clearFormatting'
  | 'emoji'

export type EditorCommandAttrs = {
  level?: 1 | 2 | 3 | 4 | 5 | 6
  href?: string
  title?: string
  src?: string
  alt?: string
  color?: string
  text?: string
  rows?: number
  cols?: number
  withHeaderRow?: boolean
}

export interface EditorDocument {
  type: 'doc'
  content?: unknown[]
}

export interface MarkdownCodec {
  parse(markdown: string): EditorDocument
  serialize(document: EditorDocument): string
  normalize(markdown: string): string
  roundTrip(markdown: string): string
}

export interface DocumentEditorAdapter {
  getMarkdown(): string
  setMarkdown(markdown: string, options?: { preserveHistory?: boolean }): void
  focus(): void
  blur(): void
  canRun(command: EditorCommand, attrs?: EditorCommandAttrs): boolean
  isActive(command: EditorCommand, attrs?: EditorCommandAttrs): boolean
  run(command: EditorCommand, attrs?: EditorCommandAttrs): boolean
  insertImage(asset: AssetRef): void
  insertAttachment(asset: AssetRef): void
  scrollToOutlineItem(id: string): boolean
  dispose(): void
}
