import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Vditor from 'vditor'
import 'vditor/dist/index.css'
import { useTheme } from '@linch-tech/desktop-core'
import { useTranslation } from 'react-i18next'
import { toolbarIcons } from './toolbar-icons'
import { EditorToolbarOverlay, type EditorToolbarActions } from './EditorToolbarOverlay'

interface EditorProps {
  content?: string
  onChange?: (markdown: string) => void
  zoom?: number
  actions?: EditorToolbarActions
}

const Editor = ({ content = '', onChange, zoom = 100, actions }: EditorProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const vditorRef = useRef<Vditor | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const contentRef = useRef(content)
  const { theme } = useTheme()
  const { t: tr, i18n } = useTranslation()
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)

  // Keep contentRef updated so theme switch preserves current edits
  useEffect(() => {
    if (vditorRef.current) {
      contentRef.current = vditorRef.current.getValue()
    }
  })

  useEffect(() => {
    if (!containerRef.current) return
    const isDark = theme === 'dark'

    const t = (name: string) => ({ name, icon: toolbarIcons[name], tipPosition: 's' as const })
    const toolbar: any[] = [
      t('headings'), t('bold'), t('italic'), t('strike'),
      '|',
      t('quote'), t('list'), t('ordered-list'), t('check'), t('outdent'), t('indent'),
      '|',
      t('code'), t('inline-code'), t('link'), t('table'), t('upload'),
      '|',
      t('line'), t('emoji'),
      '|',
      t('undo'), t('redo'),
      '|',
      t('edit-mode'), t('outline'), t('export'),
    ]

    const vd = new Vditor(containerRef.current, {
      value: contentRef.current,
      mode: 'wysiwyg',
      theme: isDark ? 'dark' : 'classic',
      lang: i18n.language === 'en' ? 'en_US' : 'zh_CN',
      height: '100%',
      placeholder: tr('editor.placeholder'),
      typewriterMode: false,
      toolbar,
      toolbarConfig: { pin: true },
      counter: { enable: false },
      cache: { enable: false },
      preview: {
        theme: { current: isDark ? 'dark' : 'light' },
        markdown: { toc: true, autoSpace: true, mark: true, codeBlockPreview: true, mathBlockPreview: true },
        math: { engine: 'KaTeX' },
        hljs: { lineNumber: true, style: isDark ? 'native' : 'github' },
      },
      customWysiwygToolbar: () => {},
      input: (value) => { onChangeRef.current?.(value) },
      after: () => {
        vditorRef.current = vd
        vd.focus()
        // Inject a mount point into the Vditor toolbar for our custom buttons
        const toolbarEl = containerRef.current?.querySelector('.vditor-toolbar')
        if (toolbarEl) {
          const mount = document.createElement('div')
          mount.className = 'editor-toolbar-portal'
          toolbarEl.appendChild(mount)
          setPortalTarget(mount)
        }
      },
    })

    return () => {
      setPortalTarget(null)
      if (vditorRef.current) {
        contentRef.current = vditorRef.current.getValue()
        vditorRef.current.destroy()
        vditorRef.current = null
      }
    }
  }, [theme, i18n.language])

  const handleMouseEnter = () => { vditorRef.current?.focus() }

  return (
    <div
      className="h-full"
      onMouseEnter={handleMouseEnter}
      style={zoom !== 100 ? { '--editor-zoom': zoom / 100 } as React.CSSProperties : undefined}
    >
      <div ref={containerRef} className="h-full" />
      {portalTarget && actions && createPortal(
        <EditorToolbarOverlay actions={actions} />,
        portalTarget
      )}
    </div>
  )
}

export default Editor
