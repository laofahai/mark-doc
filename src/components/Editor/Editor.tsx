import { useEffect, useRef, type CSSProperties } from 'react'
import Vditor from 'vditor'
import 'vditor/dist/index.css'
import { useTheme } from '@linch-tech/desktop-core'
import { useTranslation } from 'react-i18next'
import { toolbarIcons } from './toolbar-icons'
import { VditorEditorAdapter } from './VditorEditorAdapter'
import type { DocumentEditorAdapter, EditorLocaleConfig } from './editor-adapter'
import { createVditorFormattingToolbar } from './vditor-toolbar'
import { applyInlineColorToEditor, clearInlineColorFromEditor, getInlineColorEditorRange, type InlineColorKind } from './color-formatting'
import { createEmojiPickerPanel, type EmojiPickerLabels } from './emoji-picker'
import type { PackageSecurityPolicy } from '../../services/security/PackageSecurityPolicy'
import { enforceRemoteResourcePolicy, getCanonicalEditorMarkdown, installRemoteResourceRenderBoundary, observeRemoteResourcePolicy, sanitizeRenderedHtml, type LocalResourceUrlResolver } from './resource-policy'
import { describeClipboardData, handleEditorImagePaste, importEditorDataImage, importEditorUploadFiles, type ImportPastedImage } from './image-paste'
import { debugLog } from '../../services/debug-log'

const TEXT_COLORS = [
  '#FF0000', '#FF4500', '#FF8C00', '#FFD700', '#FFFF00',
  '#00FF00', '#32CD32', '#008000', '#00CED1', '#00BFFF',
  '#0000FF', '#4169E1', '#8A2BE2', '#9400D3', '#FF00FF',
  '#FF1493', '#DC143C', '#8B0000', '#A0522D', '#808080',
  '#000000',
]

const BACKGROUND_COLORS = [
  '#FEE2E2', '#FFEDD5', '#FEF3C7', '#FEF9C3', '#ECFCCB',
  '#DCFCE7', '#D1FAE5', '#CCFBF1', '#CFFAFE', '#DBEAFE',
  '#E0E7FF', '#EDE9FE', '#F3E8FF', '#FAE8FF', '#FCE7F3',
  '#FFE4E6', '#F5F5F4', '#E5E7EB', '#D6D3D1', '#F8FAFC',
  '#FFFFFF',
]

interface EditorProps {
  content?: string
  onChange?: (markdown: string) => void
  onAdapterReady?: (adapter: DocumentEditorAdapter) => void
  locale?: EditorLocaleConfig
  zoom?: number
  securityPolicy?: PackageSecurityPolicy | null
  onImagePaste?: ImportPastedImage
  resolveAssetUrl?: LocalResourceUrlResolver
}

export function resolveEditorLanguage(locale: EditorLocaleConfig | undefined, i18nLanguage: string): EditorLocaleConfig['editorLanguage'] {
  return locale?.editorLanguage ?? (i18nLanguage === 'en' ? 'en_US' : 'zh_CN')
}

function insertedMarkdownMarker(markdown: string) {
  return markdown.match(/\(([^)]+)\)/)?.[1] ?? markdown
}

interface VditorWithToolbar {
  vditor?: {
    toolbar?: {
      element?: HTMLElement
    }
  }
}

function getVditorToolbarElement(editor: Vditor) {
  return (editor as unknown as VditorWithToolbar).vditor?.toolbar?.element ?? null
}

function moveVditorToolbarToHost(editor: Vditor, host: HTMLElement | null) {
  const toolbar = getVditorToolbarElement(editor)
  if (!toolbar || !host) return
  toolbar.classList.add('markdoc-formatting-toolbar')
  host.replaceChildren(toolbar)
}

const Editor = ({ content = '', onChange, onAdapterReady, locale, zoom = 100, securityPolicy, onImagePaste, resolveAssetUrl }: EditorProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const formattingToolbarHostRef = useRef<HTMLDivElement>(null)
  const vditorRef = useRef<Vditor | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onAdapterReadyRef = useRef(onAdapterReady)
  onAdapterReadyRef.current = onAdapterReady
  const onImagePasteRef = useRef(onImagePaste)
  onImagePasteRef.current = onImagePaste
  const contentRef = useRef(content)
  const securityPolicyRef = useRef(securityPolicy)
  securityPolicyRef.current = securityPolicy
  const resolveAssetUrlRef = useRef(resolveAssetUrl)
  resolveAssetUrlRef.current = resolveAssetUrl
  const renderedPolicyRef = useRef(securityPolicy)
  const renderedAssetUrlRef = useRef(resolveAssetUrl)
  const savedRangeRef = useRef<Range | null>(null)
  const { theme } = useTheme()
  const { t: tr, i18n } = useTranslation()
  const editorLanguage = resolveEditorLanguage(locale, i18n.language)

  const insertMarkdownIntoEditor = (editor: Vditor, markdown: string) => {
    const before = getCanonicalEditorMarkdown(editor)
    const marker = insertedMarkdownMarker(markdown)
    editor.focus()
    editor.insertMD(markdown)
    window.setTimeout(() => {
      const after = getCanonicalEditorMarkdown(editor)
      if (after.includes(marker)) {
        onChangeRef.current?.(after)
        debugLog('editor.insertMarkdown.done', { marker, fallback: false })
        return
      }

      const next = before.trim()
        ? `${before.replace(/\s+$/, '')}\n\n${markdown}`
        : markdown
      editor.setValue(next)
      onChangeRef.current?.(next)
      debugLog('editor.insertMarkdown.done', { marker, fallback: true })
    }, 0)
  }

  // Keep contentRef updated so theme switch preserves current edits
  useEffect(() => {
    if (vditorRef.current) {
      contentRef.current = getCanonicalEditorMarkdown(vditorRef.current)
    }
  })

  useEffect(() => {
    contentRef.current = content
    const policyChanged = renderedPolicyRef.current !== securityPolicy
    renderedPolicyRef.current = securityPolicy
    const assetResolverChanged = renderedAssetUrlRef.current !== resolveAssetUrl
    renderedAssetUrlRef.current = resolveAssetUrl
    if (vditorRef.current && (getCanonicalEditorMarkdown(vditorRef.current) !== content || policyChanged || assetResolverChanged)) {
      vditorRef.current.setValue(content)
      if (containerRef.current) enforceRemoteResourcePolicy(containerRef.current, securityPolicy, resolveAssetUrl)
    }
  }, [content, securityPolicy, resolveAssetUrl])

  useEffect(() => {
    if (!containerRef.current) return
    return observeRemoteResourcePolicy(
      containerRef.current,
      () => securityPolicyRef.current,
      () => resolveAssetUrlRef.current
    )
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleSelectionChange = () => {
      const editor = vditorRef.current
      const root = containerRef.current
      if (!editor || !root) return
      const range = getInlineColorEditorRange(editor, root)
      if (range && !range.collapsed && range.toString()) {
        savedRangeRef.current = range
      }
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    container.addEventListener('mouseup', handleSelectionChange)
    container.addEventListener('keyup', handleSelectionChange)

    const handlePaste = (event: ClipboardEvent) => {
      const target = event.target instanceof Node ? event.target : null
      const activeElement = document.activeElement
      const isEditorPaste = Boolean((target && container.contains(target)) || (activeElement && container.contains(activeElement)))
      if (!isEditorPaste) return

      const importImage = onImagePasteRef.current
      const editor = vditorRef.current
      debugLog('editor.paste', {
        hasImportImage: Boolean(importImage),
        hasEditor: Boolean(editor),
        target: event.target instanceof Element ? event.target.className : '',
        activeElement: activeElement instanceof Element ? activeElement.className : '',
        clipboard: describeClipboardData(event),
      })
      if (!importImage || !editor) return

      void handleEditorImagePaste(event, importImage, markdown => insertMarkdownIntoEditor(editor, markdown))
        .then(handled => debugLog('editor.paste.result', { handled }))
        .catch(error => console.error('Failed to import pasted image:', error))
    }

    document.addEventListener('paste', handlePaste, true)
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
      container.removeEventListener('mouseup', handleSelectionChange)
      container.removeEventListener('keyup', handleSelectionChange)
      document.removeEventListener('paste', handlePaste, true)
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current) return
    const isDark = theme === 'dark'

    const t = (name: string) => ({ name, icon: toolbarIcons[name], tipPosition: 'n' as const })

    const applyColor = (kind: InlineColorKind, color: string) => {
      const editor = vditorRef.current
      const root = containerRef.current
      if (!editor || !root) return

      const applied = applyInlineColorToEditor(editor, root, {
        kind,
        color,
        range: savedRangeRef.current,
        onChange: markdown => onChangeRef.current?.(markdown),
      })
      if (applied) savedRangeRef.current = getInlineColorEditorRange(editor, root)
    }

    const clearColor = (kind: InlineColorKind) => {
      const editor = vditorRef.current
      const root = containerRef.current
      if (!editor || !root) return

      const cleared = clearInlineColorFromEditor(editor, root, {
        kind,
        range: savedRangeRef.current,
        onChange: markdown => onChangeRef.current?.(markdown),
      })
      if (cleared) savedRangeRef.current = getInlineColorEditorRange(editor, root)
    }

    const colorPicker = {
      name: 'font-color',
      icon: toolbarIcons['font-color'],
      tip: tr('editor.color'),
      tipPosition: 'n' as const,
      click: (event: Event) => {
        const editor = vditorRef.current
        const root = containerRef.current
        const currentRange = editor && root ? getInlineColorEditorRange(editor, root) : null
        if (currentRange && !currentRange.collapsed && currentRange.toString()) savedRangeRef.current = currentRange

        const btn = (event.currentTarget || event.target) as HTMLElement
        const toolbarItem = btn.closest('.vditor-toolbar__item') as HTMLElement | null
        const host = toolbarItem ?? btn
        const existing = host.querySelector('.color-picker-panel')
        if (existing) {
          existing.remove()
          return
        }
        btn.closest('.vditor-toolbar')?.querySelectorAll('.color-picker-panel').forEach(panel => panel.remove())

        let activeKind: InlineColorKind = 'text'
        const panel = document.createElement('div')
        panel.className = 'color-picker-panel'
        panel.addEventListener('click', e => e.stopPropagation())

        const modes = document.createElement('div')
        modes.className = 'color-picker-panel__modes'
        const modeButtons = new Map<InlineColorKind, HTMLButtonElement>()
        const clearBtn = document.createElement('button')

        const swatches = document.createElement('div')
        swatches.className = 'color-picker-panel__swatches'

        const renderSwatches = (kind: InlineColorKind) => {
          swatches.replaceChildren()
          const colors = kind === 'text' ? TEXT_COLORS : BACKGROUND_COLORS
          colors.forEach(color => {
            const swatch = document.createElement('button')
            swatch.type = 'button'
            swatch.className = 'color-picker-panel__swatch'
            swatch.dataset.colorSwatch = color
            swatch.title = color
            swatch.style.backgroundColor = color
            swatch.addEventListener('click', (e) => {
              e.stopPropagation()
              panel.remove()
              applyColor(activeKind, color)
            })
            swatches.appendChild(swatch)
          })
        }

        const updateMode = (kind: InlineColorKind) => {
          activeKind = kind
          modeButtons.forEach((modeButton, modeKind) => {
            modeButton.setAttribute('aria-pressed', String(modeKind === activeKind))
          })
          clearBtn.textContent = activeKind === 'text'
            ? tr('editor.clearTextColor')
            : tr('editor.clearBackgroundColor')
          renderSwatches(activeKind)
        }

        const addModeButton = (kind: InlineColorKind, label: string) => {
          const modeButton = document.createElement('button')
          modeButton.type = 'button'
          modeButton.className = 'color-picker-panel__mode'
          modeButton.textContent = label
          modeButton.dataset.colorMode = kind
          modeButton.addEventListener('click', e => {
            e.stopPropagation()
            updateMode(kind)
          })
          modeButtons.set(kind, modeButton)
          modes.appendChild(modeButton)
        }

        addModeButton('text', tr('editor.textColor'))
        addModeButton('background', tr('editor.backgroundColor'))
        panel.appendChild(modes)
        panel.appendChild(swatches)

        const customRow = document.createElement('div')
        customRow.className = 'color-picker-panel__controls'
        const colorInput = document.createElement('input')
        colorInput.type = 'color'
        colorInput.value = '#FF0000'
        colorInput.className = 'color-picker-panel__input'
        colorInput.title = tr('editor.color')
        colorInput.dataset.colorCustom = 'true'
        colorInput.addEventListener('change', (e) => {
          e.stopPropagation()
          panel.remove()
          applyColor(activeKind, colorInput.value)
        })
        clearBtn.type = 'button'
        clearBtn.className = 'color-picker-panel__clear'
        clearBtn.dataset.colorClear = 'true'
        clearBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          panel.remove()
          clearColor(activeKind)
        })
        customRow.appendChild(colorInput)
        customRow.appendChild(clearBtn)
        panel.appendChild(customRow)
        updateMode(activeKind)

        host.style.position = 'relative'
        host.appendChild(panel)
        const closeHandler = (e: MouseEvent) => {
          if (!panel.contains(e.target as Node)) {
            panel.remove()
            document.removeEventListener('click', closeHandler)
          }
        }
        setTimeout(() => document.addEventListener('click', closeHandler), 0)
      },
    }

    const emojiLabels: EmojiPickerLabels = {
      people: tr('editor.emojiGroups.people'),
      gestures: tr('editor.emojiGroups.gestures'),
      marks: tr('editor.emojiGroups.marks'),
      work: tr('editor.emojiGroups.work'),
      objects: tr('editor.emojiGroups.objects'),
    }

    const emojiPicker = {
      name: 'markdoc-emoji',
      icon: toolbarIcons.emoji,
      tip: tr('editor.emoji'),
      tipPosition: 'n' as const,
      click: (event: Event) => {
        const editor = vditorRef.current
        if (!editor) return

        const btn = (event.currentTarget || event.target) as HTMLElement
        const toolbarItem = btn.closest('.vditor-toolbar__item') as HTMLElement | null
        const host = toolbarItem ?? btn
        const existing = host.querySelector('.emoji-picker-panel')
        if (existing) {
          existing.remove()
          return
        }

        const toolbarElement = btn.closest('.vditor-toolbar')
        toolbarElement?.querySelectorAll('.color-picker-panel, .emoji-picker-panel').forEach(panel => panel.remove())
        toolbarElement?.querySelectorAll<HTMLElement>('.vditor-panel, .vditor-hint').forEach(panel => {
          panel.style.display = 'none'
        })

        let closeHandler: ((e: MouseEvent) => void) | null = null
        const closePanel = (panel: HTMLElement) => {
          panel.remove()
          if (closeHandler) document.removeEventListener('click', closeHandler)
          closeHandler = null
        }
        const panel = createEmojiPickerPanel({
          labels: emojiLabels,
          onSelect: emoji => {
            closePanel(panel)
            insertMarkdownIntoEditor(editor, `${emoji} `)
          },
        })

        host.style.position = 'relative'
        host.appendChild(panel)
        closeHandler = (e: MouseEvent) => {
          if (!panel.contains(e.target as Node)) closePanel(panel)
        }
        setTimeout(() => {
          if (closeHandler) document.addEventListener('click', closeHandler)
        }, 0)
      },
    }

    const toolbar = createVditorFormattingToolbar(t, colorPicker, emojiPicker)

    const vd = new Vditor(containerRef.current, {
      value: '',
      mode: 'wysiwyg',
      theme: isDark ? 'dark' : 'classic',
      lang: editorLanguage,
      height: 'auto',
      placeholder: tr('editor.placeholder'),
      typewriterMode: false,
      toolbar,
      toolbarConfig: { pin: false },
      counter: { enable: false },
      upload: {
        accept: 'image/*',
        multiple: true,
        base64ToLink: (async (dataUri: string) => {
          const importImage = onImagePasteRef.current
          debugLog('editor.upload.base64ToLink', {
            hasImportImage: Boolean(importImage),
            bytes: dataUri.length,
          })
          if (!importImage) return dataUri
          return importEditorDataImage(dataUri, importImage)
        }) as unknown as (dataUri: string) => string,
        handler: async (files: File[]) => {
          const importImage = onImagePasteRef.current
          const editor = vditorRef.current
          debugLog('editor.upload.handler', {
            hasImportImage: Boolean(importImage),
            hasEditor: Boolean(editor),
            files: files.map(file => ({ name: file.name, type: file.type, size: file.size })),
          })
          if (!importImage || !editor) return null
          return importEditorUploadFiles(files, importImage, markdown => insertMarkdownIntoEditor(editor, markdown))
        },
      },
      cache: { enable: false },
      preview: {
        theme: { current: isDark ? 'dark' : 'light' },
        markdown: { toc: true, autoSpace: true, mark: true, codeBlockPreview: true, mathBlockPreview: true },
        transform: html => sanitizeRenderedHtml(html, securityPolicyRef.current, resolveAssetUrlRef.current),
        math: { engine: 'KaTeX' },
        hljs: { lineNumber: true, style: isDark ? 'native' : 'github' },
      },
      customWysiwygToolbar: () => {},
      input: () => { onChangeRef.current?.(getCanonicalEditorMarkdown(vd)) },
      after: () => {
        vditorRef.current = vd
        moveVditorToolbarToHost(vd, formattingToolbarHostRef.current)
        installRemoteResourceRenderBoundary(vd, () => securityPolicyRef.current, () => resolveAssetUrlRef.current)
        vd.setValue(contentRef.current)
        if (containerRef.current) enforceRemoteResourcePolicy(containerRef.current, securityPolicyRef.current, resolveAssetUrlRef.current)
        onAdapterReadyRef.current?.(new VditorEditorAdapter({
          getValue: () => getCanonicalEditorMarkdown(vd),
          setValue: value => vd.setValue(value),
          focus: () => vd.focus(),
          insertValue: value => insertMarkdownIntoEditor(vd, value),
        }))
        vd.focus()
      },
    })

    return () => {
      if (vditorRef.current) {
        contentRef.current = getCanonicalEditorMarkdown(vditorRef.current)
        vditorRef.current.destroy()
        formattingToolbarHostRef.current?.replaceChildren()
        vditorRef.current = null
      }
    }
  }, [theme, editorLanguage])

  return (
    <div
      className="editor-shell h-full"
      style={zoom !== 100 ? { '--editor-zoom': zoom / 100 } as CSSProperties : undefined}
    >
      <div ref={containerRef} className="editor-vditor-surface h-full" />
      <div ref={formattingToolbarHostRef} className="editor-formatting-toolbar-host" />
    </div>
  )
}

export default Editor
