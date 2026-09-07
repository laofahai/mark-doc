import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { searchKeymap } from '@codemirror/search'
import type { DocumentEditorAdapter } from './editor-adapter'
import { getEditorOutline } from '../../editor-core/outline'
import { handleEditorImagePaste, hasPastedImageFile } from '../../editor-core/asset-bridge'
import type { EditorProps } from './EditorShell'

type Props = EditorProps & { onAdapterChange: (adapter: DocumentEditorAdapter | null) => void }

export default function SourceEditor(props: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const replaceRef = useRef<((markdown: string) => void) | null>(null)
  const propsRef = useRef(props)
  propsRef.current = props

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const insert = (text: string) => {
      const view = viewRef.current
      if (!view) return
      view.dispatch(view.state.replaceSelection(text), { scrollIntoView: true })
      view.focus()
    }
    const createState = (markdown: string) => EditorState.create({
        doc: markdown,
        extensions: [
          EditorState.lineSeparator.of(markdown.match(/\r\n|\r|\n/)?.[0] ?? '\n'),
          lineNumbers(), history(),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          EditorView.contentAttributes.of({ 'aria-label': 'Markdown', 'data-testid': 'markdoc-source-content' }),
          EditorView.updateListener.of(update => {
            if (update.docChanged) propsRef.current.onChange?.(update.state.sliceDoc())
          }),
          EditorView.domEventHandlers({
            paste: event => {
              const importImage = propsRef.current.onImagePaste
              if (!importImage || !hasPastedImageFile(event)) return false
              void handleEditorImagePaste(event, importImage, insert).catch(error => console.error('Image import failed', error))
              return true
            },
          }),
          EditorView.theme({
            '&': { height: '100%', color: 'var(--foreground)', backgroundColor: 'var(--background)', fontSize: 'calc(14px * var(--editor-zoom, 1))' },
            '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, monospace' },
            '.cm-content': { padding: '16px 0' },
            '.cm-gutters': { backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)', border: 'none' },
            '.cm-activeLineGutter': { backgroundColor: 'var(--accent)' },
            '.cm-cursor': { borderLeftColor: 'var(--foreground)' },
          }),
        ],
      })
    const view = new EditorView({
      parent: root,
      state: createState(propsRef.current.content ?? ''),
    })
    viewRef.current = view
    const replaceDocument = (markdown: string) => view.setState(createState(markdown))
    replaceRef.current = replaceDocument
    const adapter: DocumentEditorAdapter = {
      getMarkdown: () => view.state.sliceDoc(),
      setMarkdown: replaceDocument,
      focus: () => view.focus(),
      blur: () => view.contentDOM.blur(),
      canRun: () => false,
      isActive: () => false,
      run: () => false,
      insertImage: asset => insert(`![image](${asset.markdownPath})`),
      insertAttachment: asset => insert(`[${asset.markdownPath}](${asset.markdownPath})`),
      scrollToOutlineItem: id => {
        const heading = getEditorOutline(view.state.sliceDoc()).find(item => item.id === id)
        if (!heading) return false
        const position = view.state.doc.line(heading.line).from
        view.dispatch({ selection: { anchor: position }, effects: EditorView.scrollIntoView(position, { y: 'start' }) })
        return true
      },
      dispose: () => view.destroy(),
    }
    propsRef.current.onAdapterReady?.(adapter)
    propsRef.current.onAdapterChange(adapter)
    let printContent: HTMLPreElement | null = null
    const afterPrint = () => { printContent?.remove(); printContent = null }
    const beforePrint = () => {
      afterPrint()
      printContent = document.createElement('pre')
      printContent.className = 'markdoc-source-print'
      printContent.textContent = view.state.sliceDoc()
      root.appendChild(printContent)
    }
    window.addEventListener('beforeprint', beforePrint)
    window.addEventListener('afterprint', afterPrint)
    return () => {
      window.removeEventListener('beforeprint', beforePrint)
      window.removeEventListener('afterprint', afterPrint)
      afterPrint()
      propsRef.current.onAdapterChange(null)
      viewRef.current = null
      replaceRef.current = null
      view.destroy()
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    const content = props.content ?? ''
    if (view && content !== view.state.sliceDoc()) {
      replaceRef.current?.(content)
    }
  }, [props.content])

  return <div ref={rootRef} className="markdoc-source-editor" data-testid="markdoc-source-editor" />
}
