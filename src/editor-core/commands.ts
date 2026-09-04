import type { Editor } from '@tiptap/core'
import type { EditorCommand, EditorCommandAttrs } from './types'

type ExtensionCommandChain = ReturnType<Editor['chain']> & {
  toggleTaskList: () => ExtensionCommandChain
  setLink: (attrs: { href: string; title?: string }) => ExtensionCommandChain
  setImage: (attrs: { src: string; alt?: string; title?: string }) => ExtensionCommandChain
  insertContent: (content: string, options?: { contentType: 'markdown' }) => ExtensionCommandChain
  insertTable: (attrs: { rows: number; cols: number; withHeaderRow: boolean }) => ExtensionCommandChain
  setColor: (color: string) => ExtensionCommandChain
  unsetColor: () => ExtensionCommandChain
  setHighlight: (attrs: { color: string }) => ExtensionCommandChain
  unsetHighlight: () => ExtensionCommandChain
}
type CommandCan = ReturnType<Editor['can']> & {
  chain: () => ExtensionCommandChain
}

function commandChain(editor: Editor) {
  return editor.chain().focus() as unknown as ExtensionCommandChain
}

function canCommandChain(editor: Editor) {
  return (editor.can() as CommandCan).chain().focus()
}

function runChain(chain: ExtensionCommandChain, command: EditorCommand, attrs: EditorCommandAttrs) {
  switch (command) {
    case 'bold':
      return chain.toggleBold().run()
    case 'italic':
      return chain.toggleItalic().run()
    case 'strike':
      return chain.toggleStrike().run()
    case 'blockquote':
      return chain.toggleBlockquote().run()
    case 'bulletList':
      return chain.toggleBulletList().run()
    case 'orderedList':
      return chain.toggleOrderedList().run()
    case 'taskList':
      return chain.toggleTaskList().run()
    case 'heading':
      return chain.toggleHeading({ level: attrs.level ?? 2 }).run()
    case 'inlineCode':
      return chain.toggleCode().run()
    case 'codeBlock':
      return chain.toggleCodeBlock().run()
    case 'link':
      return attrs.href ? chain.setLink({ href: attrs.href, title: attrs.title }).run() : false
    case 'image':
      return attrs.src ? chain.setImage({ src: attrs.src, alt: attrs.alt ?? 'image', title: attrs.title }).run() : false
    case 'attachment':
      return attrs.href ? chain.insertContent(`[${attrs.text ?? attrs.href}](${attrs.href})`, { contentType: 'markdown' }).run() : false
    case 'table':
      return chain.insertTable({
        rows: attrs.rows ?? 3,
        cols: attrs.cols ?? 3,
        withHeaderRow: attrs.withHeaderRow ?? true,
      }).run()
    case 'horizontalRule':
      return chain.setHorizontalRule().run()
    case 'textColor':
      return attrs.color ? chain.setColor(attrs.color).run() : false
    case 'backgroundColor':
      return attrs.color ? chain.setHighlight({ color: attrs.color }).run() : false
    case 'clearTextColor':
      return chain.unsetColor().run()
    case 'clearBackgroundColor':
      return chain.unsetHighlight().run()
    case 'clearFormatting':
      return chain.unsetAllMarks().clearNodes().run()
    case 'emoji':
      return attrs.text ? chain.insertContent(attrs.text).run() : false
  }
}

export function runEditorCommand(editor: Editor, command: EditorCommand, attrs: EditorCommandAttrs = {}) {
  try {
    return runChain(commandChain(editor), command, attrs)
  } catch {
    return false
  }
}

export function canRunEditorCommand(editor: Editor, command: EditorCommand, attrs: EditorCommandAttrs = {}) {
  try {
    return runChain(canCommandChain(editor), command, attrs)
  } catch {
    return false
  }
}

export function isEditorCommandActive(editor: Editor, command: EditorCommand, attrs: EditorCommandAttrs = {}) {
  switch (command) {
    case 'bold':
      return editor.isActive('bold')
    case 'italic':
      return editor.isActive('italic')
    case 'strike':
      return editor.isActive('strike')
    case 'blockquote':
      return editor.isActive('blockquote')
    case 'bulletList':
      return editor.isActive('bulletList')
    case 'orderedList':
      return editor.isActive('orderedList')
    case 'taskList':
      return editor.isActive('taskList')
    case 'heading':
      return editor.isActive('heading', { level: attrs.level ?? 2 })
    case 'inlineCode':
      return editor.isActive('code')
    case 'codeBlock':
      return editor.isActive('codeBlock')
    case 'link':
      return editor.isActive('link')
    case 'image':
      return editor.isActive('image')
    case 'table':
      return editor.isActive('table')
    case 'textColor':
      return attrs.color ? editor.isActive('textStyle', { color: attrs.color }) : editor.isActive('textStyle')
    case 'backgroundColor':
      return attrs.color ? editor.isActive('highlight', { color: attrs.color }) : editor.isActive('highlight')
    case 'clearTextColor':
    case 'clearBackgroundColor':
    case 'attachment':
    case 'horizontalRule':
    case 'clearFormatting':
    case 'emoji':
      return false
  }
}
