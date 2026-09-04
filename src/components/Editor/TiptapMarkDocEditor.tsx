import { useEffect, useRef } from 'react'
import type { Editor as TiptapEditor } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import { handleEditorImagePaste, describeClipboardData, hasPastedImageFile, type ImportPastedImage } from '../../editor-core/asset-bridge'
import { createMarkDocExtensions } from '../../editor-core/markdoc-extensions'
import { prepareMarkdownForEditor } from '../../editor-core/markdown-codec'
import { getEditorOutline } from '../../editor-core/outline'
import { enforceRemoteResourcePolicy, observeRemoteResourcePolicy, type LocalResourceUrlResolver } from '../../editor-core/resource-security'
import type { PackageSecurityPolicy } from '../../services/security/PackageSecurityPolicy'
import { debugLog } from '../../services/debug-log'
import { TiptapEditorAdapter } from './TiptapEditorAdapter'
import type { DocumentEditorAdapter } from './editor-adapter'

interface TiptapMarkDocEditorProps {
  content: string
  placeholder: string
  onChange?: (markdown: string) => void
  onAdapterReady?: (adapter: DocumentEditorAdapter) => void
  onAdapterChange?: (adapter: DocumentEditorAdapter | null) => void
  onRevision?: () => void
  securityPolicy?: PackageSecurityPolicy | null
  resolveAssetUrl?: LocalResourceUrlResolver
  onImagePaste?: ImportPastedImage
}

function markdownFrom(editor: TiptapEditor) {
  return editor.getMarkdown()
}

function insertMarkdown(editor: TiptapEditor, markdown: string) {
  editor.chain().focus().insertContent(markdown, { contentType: 'markdown' }).run()
  editor.commands.focus('end')
}

function annotateOutline(root: HTMLElement, markdown: string) {
  const headings = Array.from(root.querySelectorAll<HTMLElement>('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6'))
  const outline = getEditorOutline(markdown)
  headings.forEach((heading, index) => {
    const item = outline[index]
    if (item) heading.dataset.markdocOutlineId = item.id
    else heading.removeAttribute('data-markdoc-outline-id')
  })
}

export function TiptapMarkDocEditor({
  content,
  placeholder,
  onChange,
  onAdapterReady,
  onAdapterChange,
  onRevision,
  securityPolicy,
  resolveAssetUrl,
  onImagePaste,
}: TiptapMarkDocEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const adapterRef = useRef<TiptapEditorAdapter | null>(null)
  const editorRef = useRef<TiptapEditor | null>(null)
  const lastExternalContentRef = useRef(content)
  const securityPolicyRef = useRef(securityPolicy)
  const resolveAssetUrlRef = useRef(resolveAssetUrl)
  const onImagePasteRef = useRef(onImagePaste)
  const onChangeRef = useRef(onChange)
  const onRevisionRef = useRef(onRevision)

  securityPolicyRef.current = securityPolicy
  resolveAssetUrlRef.current = resolveAssetUrl
  onImagePasteRef.current = onImagePaste
  onChangeRef.current = onChange
  onRevisionRef.current = onRevision

  const applyRenderPolicies = (editor: TiptapEditor) => {
    const root = rootRef.current
    if (!root) return
    enforceRemoteResourcePolicy(root, securityPolicyRef.current, resolveAssetUrlRef.current)
    annotateOutline(root, markdownFrom(editor))
  }

  const editor = useEditor({
    extensions: createMarkDocExtensions({ placeholder }),
    content: prepareMarkdownForEditor(content),
    contentType: 'markdown',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'markdoc-prosemirror',
        'data-testid': 'markdoc-editor-content',
        'data-markdoc-editor-content': 'true',
      },
      handleDOMEvents: {
        paste: (_view, event) => {
          const importImage = onImagePasteRef.current
          const currentEditor = editorRef.current
          debugLog('editor.paste', {
            hasImportImage: Boolean(importImage),
            hasEditor: Boolean(currentEditor),
            clipboard: describeClipboardData(event),
          })
          if (!importImage || !currentEditor) return false
          const hasImageFile = hasPastedImageFile(event)
          if (hasImageFile) {
            event.preventDefault()
            event.stopPropagation()
            event.stopImmediatePropagation()
          }
          void handleEditorImagePaste(event, importImage, markdown => {
            insertMarkdown(currentEditor, markdown)
            onChangeRef.current?.(markdownFrom(currentEditor))
            onRevisionRef.current?.()
            applyRenderPolicies(currentEditor)
          })
            .then(handled => debugLog('editor.paste.result', { handled }))
            .catch(cause => debugLog('editor.paste.failed', { cause }))
          return hasImageFile
        },
      },
    },
    onCreate: ({ editor: createdEditor }) => {
      const root = rootRef.current
      if (!root) return
      const adapter = new TiptapEditorAdapter(createdEditor, root)
      adapterRef.current = adapter
      onAdapterReady?.(adapter)
      onAdapterChange?.(adapter)
      window.setTimeout(() => applyRenderPolicies(createdEditor), 0)
    },
    onUpdate: ({ editor: updatedEditor }) => {
      const markdown = markdownFrom(updatedEditor)
      lastExternalContentRef.current = markdown
      onChangeRef.current?.(markdown)
      onRevisionRef.current?.()
      window.setTimeout(() => applyRenderPolicies(updatedEditor), 0)
    },
    onSelectionUpdate: ({ editor: updatedEditor }) => {
      onRevisionRef.current?.()
      window.setTimeout(() => applyRenderPolicies(updatedEditor), 0)
    },
  })

  editorRef.current = editor

  useEffect(() => {
    if (!editor) return
    if (content === lastExternalContentRef.current || content === markdownFrom(editor)) return
    lastExternalContentRef.current = content
    editor.commands.setContent(prepareMarkdownForEditor(content), { contentType: 'markdown' })
    window.setTimeout(() => applyRenderPolicies(editor), 0)
  }, [content, editor])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    return observeRemoteResourcePolicy(
      root,
      () => securityPolicyRef.current,
      () => resolveAssetUrlRef.current,
    )
  }, [])

  useEffect(() => {
    if (editor) window.setTimeout(() => applyRenderPolicies(editor), 0)
  }, [editor, securityPolicy, resolveAssetUrl])

  useEffect(() => {
    return () => {
      adapterRef.current = null
      onAdapterChange?.(null)
    }
  }, [onAdapterChange])

  return (
    <div ref={rootRef} className="markdoc-tiptap-editor">
      <EditorContent editor={editor} />
    </div>
  )
}
