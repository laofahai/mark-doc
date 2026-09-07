import { useEffect, useMemo, useRef, useState } from 'react'
import type { Editor as TiptapEditor } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import { handleEditorImagePaste, describeClipboardData, hasPastedImageFile, type ImportPastedImage } from '../../editor-core/asset-bridge'
import { createMarkDocExtensions } from '../../editor-core/markdoc-extensions'
import { prepareMarkdownForEditor } from '../../editor-core/markdown-codec'
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
  const [initialContent] = useState(() => prepareMarkdownForEditor(content))
  const extensions = useMemo(() => createMarkDocExtensions({ placeholder }), [placeholder])

  securityPolicyRef.current = securityPolicy
  resolveAssetUrlRef.current = resolveAssetUrl
  onImagePasteRef.current = onImagePaste
  onChangeRef.current = onChange
  onRevisionRef.current = onRevision

  const applyRenderPolicies = () => {
    const root = rootRef.current
    if (!root) return
    enforceRemoteResourcePolicy(root, securityPolicyRef.current, resolveAssetUrlRef.current)
  }

  const editor = useEditor({
    extensions,
    content: initialContent,
    contentType: 'markdown',
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        class: 'markdoc-prosemirror',
        'data-testid': 'markdoc-editor-content',
        'data-markdoc-editor-content': 'true',
        'data-markdoc-document-page': 'true',
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
            applyRenderPolicies()
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
      const adapter = new TiptapEditorAdapter(createdEditor, root, () => lastExternalContentRef.current)
      adapterRef.current = adapter
      onAdapterReady?.(adapter)
      onAdapterChange?.(adapter)
      window.setTimeout(applyRenderPolicies, 0)
    },
    onUpdate: ({ editor: updatedEditor }) => {
      const markdown = markdownFrom(updatedEditor)
      lastExternalContentRef.current = markdown
      onChangeRef.current?.(markdown)
      onRevisionRef.current?.()
      window.setTimeout(applyRenderPolicies, 0)
    },
    onSelectionUpdate: () => {
      onRevisionRef.current?.()
    },
  })

  editorRef.current = editor

  useEffect(() => {
    if (!editor) return
    if (content === lastExternalContentRef.current || content === markdownFrom(editor)) return
    lastExternalContentRef.current = content
    editor.commands.setContent(prepareMarkdownForEditor(content), { contentType: 'markdown' })
    window.setTimeout(applyRenderPolicies, 0)
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
    if (editor) window.setTimeout(applyRenderPolicies, 0)
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
