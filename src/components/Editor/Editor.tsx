import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Vditor from 'vditor'
import 'vditor/dist/index.css'
import { useTheme } from '@linch-tech/desktop-core'
import { useTranslation } from 'react-i18next'
import { toolbarIcons } from './toolbar-icons'
import { EditorToolbarOverlay, type EditorToolbarActions } from './EditorToolbarOverlay'

const PRESET_COLORS = [
  '#FF0000', '#FF4500', '#FF8C00', '#FFD700', '#FFFF00',
  '#00FF00', '#32CD32', '#008000', '#00CED1', '#00BFFF',
  '#0000FF', '#4169E1', '#8A2BE2', '#9400D3', '#FF00FF',
  '#FF1493', '#DC143C', '#8B0000', '#A0522D', '#808080',
  '#000000',
]

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
  const savedRangeRef = useRef<Range | null>(null)
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

    // 颜色选择器：点击后弹出颜色面板
    const colorPicker = {
      name: 'font-color',
      icon: toolbarIcons['font-color'],
      tip: tr('editor.fontColor'),
      tipPosition: 's' as const,
      click: (event: Event) => {
        // 保存当前选区，防止点击面板后丢失
        const sel = window.getSelection()
        if (sel && sel.rangeCount > 0) {
          savedRangeRef.current = sel.getRangeAt(0).cloneRange()
        }
        const btn = (event.currentTarget || event.target) as HTMLElement
        // 如果已经有面板打开就关闭
        const existing = btn.parentElement?.querySelector('.color-picker-panel')
        if (existing) { existing.remove(); return }
        // 创建颜色面板
        const panel = document.createElement('div')
        panel.className = 'color-picker-panel'
        panel.style.cssText = 'position:absolute;top:100%;left:0;z-index:999;background:var(--panel-background, #fff);border:1px solid var(--border-color, #e0e0e0);border-radius:6px;padding:8px;display:grid;grid-template-columns:repeat(7,1fr);gap:4px;box-shadow:0 4px 12px rgba(0,0,0,0.15);'
        PRESET_COLORS.forEach(color => {
          const swatch = document.createElement('button')
          swatch.style.cssText = `width:20px;height:20px;border-radius:3px;border:1px solid rgba(0,0,0,0.15);cursor:pointer;background:${color};padding:0;`
          swatch.title = color
          swatch.addEventListener('click', (e) => {
            e.stopPropagation()
            panel.remove()
            applyColor(color)
          })
          panel.appendChild(swatch)
        })
        // 自定义颜色输入
        const customRow = document.createElement('div')
        customRow.style.cssText = 'grid-column:1/-1;display:flex;gap:4px;margin-top:4px;'
        const colorInput = document.createElement('input')
        colorInput.type = 'color'
        colorInput.value = '#FF0000'
        colorInput.style.cssText = 'width:28px;height:24px;border:none;padding:0;cursor:pointer;background:none;'
        const applyBtn = document.createElement('button')
        applyBtn.textContent = tr('common.apply') || 'Apply'
        applyBtn.style.cssText = 'flex:1;height:24px;border:1px solid var(--border-color, #e0e0e0);border-radius:3px;cursor:pointer;font-size:11px;background:var(--panel-background, #fff);color:inherit;'
        applyBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          panel.remove()
          applyColor(colorInput.value)
        })
        // 清除颜色按钮
        const clearBtn = document.createElement('button')
        clearBtn.textContent = tr('editor.clearColor') || 'Clear'
        clearBtn.style.cssText = 'height:24px;padding:0 6px;border:1px solid var(--border-color, #e0e0e0);border-radius:3px;cursor:pointer;font-size:11px;background:var(--panel-background, #fff);color:inherit;'
        clearBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          panel.remove()
          clearColor()
        })
        customRow.appendChild(colorInput)
        customRow.appendChild(applyBtn)
        customRow.appendChild(clearBtn)
        panel.appendChild(customRow)
        btn.style.position = 'relative'
        btn.appendChild(panel)
        // 点击外部关闭
        const closeHandler = (e: MouseEvent) => {
          if (!panel.contains(e.target as Node)) {
            panel.remove()
            document.removeEventListener('click', closeHandler)
          }
        }
        setTimeout(() => document.addEventListener('click', closeHandler), 0)
      },
    }

    const applyColor = (color: string) => {
      const vd = vditorRef.current
      if (!vd) return

      // 恢复保存的选区
      const range = savedRangeRef.current
      if (!range || range.collapsed) return
      const sel = window.getSelection()
      if (!sel) return
      sel.removeAllRanges()
      sel.addRange(range)

      const selectedText = range.toString()
      if (!selectedText) return

      // 创建带颜色的 span 节点
      const span = document.createElement('span')
      span.setAttribute('style', `color: ${color}`)
      span.textContent = selectedText

      // 替换选区内容
      range.deleteContents()
      range.insertNode(span)

      // 把光标放到 span 后面
      sel.collapseToEnd()

      // 触发 Vditor 内部更新
      const wysiwyg = containerRef.current?.querySelector('.vditor-wysiwyg') as HTMLElement
      if (wysiwyg) {
        wysiwyg.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }

    const clearColor = () => {
      const vd = vditorRef.current
      if (!vd) return

      // 恢复保存的选区
      const range = savedRangeRef.current
      if (!range) return
      const sel = window.getSelection()
      if (!sel) return
      sel.removeAllRanges()
      sel.addRange(range)
      // 检查选区是否在一个带 color style 的 span 内
      let node: Node | null = range.startContainer
      while (node && node !== containerRef.current) {
        if (node.nodeType === 1) {
          const el = node as HTMLElement
          if (el.tagName === 'SPAN' && el.style.color) {
            // 把 span 内容解包
            const parent = el.parentNode
            if (parent) {
              while (el.firstChild) parent.insertBefore(el.firstChild, el)
              parent.removeChild(el)
              // 触发更新
              const wysiwyg = containerRef.current?.querySelector('.vditor-wysiwyg') as HTMLElement
              if (wysiwyg) wysiwyg.dispatchEvent(new Event('input', { bubbles: true }))
            }
            return
          }
        }
        node = node.parentNode
      }
    }

    const toolbar: any[] = [
      t('headings'), t('bold'), t('italic'), t('strike'),
      '|',
      t('quote'), t('list'), t('ordered-list'), t('check'), t('outdent'), t('indent'),
      '|',
      t('code'), t('inline-code'), t('link'), t('table'), t('upload'),
      '|',
      colorPicker, t('line'), t('emoji'),
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
