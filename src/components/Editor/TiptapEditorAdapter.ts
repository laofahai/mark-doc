import type { Editor as TiptapEditor } from '@tiptap/core'
import type { AssetRef } from '../../services/assets/AssetManager'
import { prepareMarkdownForEditor } from '../../editor-core/markdown-codec'
import { scrollToOutlineTarget } from '../../editor-core/outline'
import {
  canRunEditorCommand,
  isEditorCommandActive,
  runEditorCommand,
} from '../../editor-core/commands'
import type { DocumentEditorAdapter, EditorCommand, EditorCommandAttrs } from '../../editor-core/types'

export class TiptapEditorAdapter implements DocumentEditorAdapter {
  private disposed = false

  constructor(
    private editor: TiptapEditor,
    private root: HTMLElement,
  ) {}

  getMarkdown() {
    return this.editor.getMarkdown()
  }

  setMarkdown(markdown: string) {
    this.editor.commands.setContent(prepareMarkdownForEditor(markdown), { contentType: 'markdown' })
  }

  focus() {
    this.editor.commands.focus()
  }

  blur() {
    this.editor.commands.blur()
  }

  canRun(command: EditorCommand, attrs?: EditorCommandAttrs) {
    return canRunEditorCommand(this.editor, command, attrs)
  }

  isActive(command: EditorCommand, attrs?: EditorCommandAttrs) {
    return isEditorCommandActive(this.editor, command, attrs)
  }

  run(command: EditorCommand, attrs?: EditorCommandAttrs) {
    return runEditorCommand(this.editor, command, attrs)
  }

  private insertMarkdown(markdown: string) {
    const result = this.editor.chain().focus().insertContent(markdown, { contentType: 'markdown' }).run()
    this.editor.commands.focus('end')
    return result
  }

  insertImage(asset: AssetRef) {
    this.insertMarkdown(`![image](${asset.markdownPath})\n\n`)
  }

  insertAttachment(asset: AssetRef) {
    this.insertMarkdown(`[${asset.markdownPath}](${asset.markdownPath})\n\n`)
  }

  scrollToOutlineItem(id: string) {
    return scrollToOutlineTarget(this.root, id)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.editor.destroy()
  }
}
