import { useMemo, useRef, useState } from 'react'
import {
  Bold,
  Code,
  Code2,
  Heading,
  Highlighter,
  ImageUp,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Palette,
  Quote,
  Smile,
  Strikethrough,
  Table,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { EditorCommand, EditorCommandAttrs } from '../../editor-core/types'
import { isEditorImageFile, type ImportPastedImage } from '../../editor-core/asset-bridge'
import type { DocumentEditorAdapter } from './editor-adapter'
import { EMOJI_GROUPS, type EmojiGroupId } from './emoji-picker'

type PopoverKind = 'color' | 'emoji' | null
type ColorKind = 'text' | 'background'

const TEXT_COLORS = [
  '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2',
  '#2563eb', '#4f46e5', '#7c3aed', '#c026d3', '#db2777',
  '#525252', '#171717',
]

const BACKGROUND_COLORS = [
  '#fee2e2', '#ffedd5', '#fef3c7', '#ecfccb', '#dcfce7',
  '#ccfbf1', '#dbeafe', '#e0e7ff', '#ede9fe', '#fae8ff',
  '#f5f5f4', '#f8fafc',
]

interface ToolbarButton {
  id: string
  command: EditorCommand
  labelKey: string
  icon: typeof Bold
  attrs?: EditorCommandAttrs
}

interface EditorToolbarProps {
  adapter: DocumentEditorAdapter | null
  revision: number
  onImagePaste?: ImportPastedImage
}

const BUTTONS: ToolbarButton[] = [
  { id: 'heading', command: 'heading', labelKey: 'editor.toolbar.heading', icon: Heading, attrs: { level: 2 } },
  { id: 'bold', command: 'bold', labelKey: 'editor.toolbar.bold', icon: Bold },
  { id: 'italic', command: 'italic', labelKey: 'editor.toolbar.italic', icon: Italic },
  { id: 'strike', command: 'strike', labelKey: 'editor.toolbar.strike', icon: Strikethrough },
  { id: 'blockquote', command: 'blockquote', labelKey: 'editor.toolbar.blockquote', icon: Quote },
  { id: 'bulletList', command: 'bulletList', labelKey: 'editor.toolbar.bulletList', icon: List },
  { id: 'orderedList', command: 'orderedList', labelKey: 'editor.toolbar.orderedList', icon: ListOrdered },
  { id: 'taskList', command: 'taskList', labelKey: 'editor.toolbar.taskList', icon: ListChecks },
  { id: 'inlineCode', command: 'inlineCode', labelKey: 'editor.toolbar.inlineCode', icon: Code },
  { id: 'codeBlock', command: 'codeBlock', labelKey: 'editor.toolbar.codeBlock', icon: Code2 },
  { id: 'table', command: 'table', labelKey: 'editor.toolbar.table', icon: Table, attrs: { rows: 3, cols: 3, withHeaderRow: true } },
  { id: 'horizontalRule', command: 'horizontalRule', labelKey: 'editor.toolbar.horizontalRule', icon: Minus },
]

export function EditorToolbar({ adapter, revision: _revision, onImagePaste }: EditorToolbarProps) {
  const { t } = useTranslation()
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const [popover, setPopover] = useState<PopoverKind>(null)
  const [colorKind, setColorKind] = useState<ColorKind>('text')
  const [emojiGroup, setEmojiGroup] = useState<EmojiGroupId>('people')

  const activeEmojiGroup = useMemo(
    () => EMOJI_GROUPS.find(group => group.id === emojiGroup) ?? EMOJI_GROUPS[0],
    [emojiGroup],
  )

  const run = (command: EditorCommand, attrs?: EditorCommandAttrs) => {
    if (!adapter) return
    adapter.run(command, attrs)
  }

  const applyColor = (kind: ColorKind, color: string) => {
    run(kind === 'text' ? 'textColor' : 'backgroundColor', { color })
    setPopover(null)
  }

  const applyLink = () => {
    if (!adapter) return
    const href = window.prompt(t('editor.linkUrl'), 'https://')
    const normalizedHref = href?.trim()
    if (!normalizedHref) return
    adapter.run('link', { href: normalizedHref })
  }

  const uploadFiles = async (files: FileList | null) => {
    if (!files || !adapter || !onImagePaste) return
    for (const file of Array.from(files)) {
      if (!isEditorImageFile(file)) continue
      const assetPath = await onImagePaste(file)
      if (assetPath) adapter.run('image', { src: assetPath, alt: 'image' })
    }
    if (uploadInputRef.current) uploadInputRef.current.value = ''
  }

  return (
    <div className="markdoc-formatting-toolbar-wrap">
      <div
        className="markdoc-formatting-toolbar"
        role="toolbar"
        aria-label={t('editor.formattingToolbar')}
      >
        {BUTTONS.map(button => {
          const Icon = button.icon
          const disabled = !adapter || !adapter.canRun(button.command, button.attrs)
          const active = Boolean(adapter?.isActive(button.command, button.attrs))
          return (
            <button
              key={button.id}
              type="button"
              className="markdoc-toolbar-button"
              data-active={active || undefined}
              disabled={disabled}
              aria-label={t(button.labelKey)}
              title={t(button.labelKey)}
              onMouseDown={event => event.preventDefault()}
              onClick={() => run(button.command, button.attrs)}
            >
              <Icon size={14} strokeWidth={1.75} />
            </button>
          )
        })}

        <span className="markdoc-toolbar-divider" />

        <button
          type="button"
          className="markdoc-toolbar-button"
          data-active={adapter?.isActive('link') || undefined}
          aria-label={t('editor.toolbar.link')}
          title={t('editor.toolbar.link')}
          disabled={!adapter}
          onMouseDown={event => event.preventDefault()}
          onClick={applyLink}
        >
          <Link size={14} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="markdoc-toolbar-button"
          aria-label={t('editor.toolbar.uploadImage')}
          title={t('editor.toolbar.uploadImage')}
          disabled={!adapter || !onImagePaste}
          onMouseDown={event => event.preventDefault()}
          onClick={() => uploadInputRef.current?.click()}
        >
          <ImageUp size={14} strokeWidth={1.75} />
        </button>
        <input
          ref={uploadInputRef}
          className="markdoc-toolbar-upload-input"
          type="file"
          accept="image/*"
          multiple
          onChange={event => void uploadFiles(event.currentTarget.files)}
        />

        <button
          type="button"
          className="markdoc-toolbar-button"
          data-active={popover === 'color' && colorKind === 'text' || undefined}
          aria-label={t('editor.textColor')}
          title={t('editor.textColor')}
          disabled={!adapter}
          onMouseDown={event => event.preventDefault()}
          onClick={() => {
            setColorKind('text')
            setPopover(popover === 'color' && colorKind === 'text' ? null : 'color')
          }}
        >
          <Palette size={14} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="markdoc-toolbar-button"
          data-active={popover === 'color' && colorKind === 'background' || undefined}
          aria-label={t('editor.backgroundColor')}
          title={t('editor.backgroundColor')}
          disabled={!adapter}
          onMouseDown={event => event.preventDefault()}
          onClick={() => {
            setColorKind('background')
            setPopover(popover === 'color' && colorKind === 'background' ? null : 'color')
          }}
        >
          <Highlighter size={14} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="markdoc-toolbar-button"
          data-active={popover === 'emoji' || undefined}
          aria-label={t('editor.emoji')}
          title={t('editor.emoji')}
          disabled={!adapter}
          onMouseDown={event => event.preventDefault()}
          onClick={() => setPopover(popover === 'emoji' ? null : 'emoji')}
        >
          <Smile size={14} strokeWidth={1.75} />
        </button>

        {popover === 'color' && (
          <div className="markdoc-toolbar-popover" role="dialog" aria-label={t(colorKind === 'text' ? 'editor.textColor' : 'editor.backgroundColor')} data-placement="top">
            <div className="markdoc-color-mode-row">
              <button type="button" className="markdoc-color-mode" aria-pressed={colorKind === 'text'} onClick={() => setColorKind('text')}>
                {t('editor.textColor')}
              </button>
              <button type="button" className="markdoc-color-mode" aria-pressed={colorKind === 'background'} onClick={() => setColorKind('background')}>
                {t('editor.backgroundColor')}
              </button>
            </div>
            <div className="markdoc-color-grid">
              {(colorKind === 'text' ? TEXT_COLORS : BACKGROUND_COLORS).map(color => (
                <button
                  key={color}
                  type="button"
                  className="markdoc-color-swatch"
                  style={{ backgroundColor: color }}
                  aria-label={color}
                  title={color}
                  onClick={() => applyColor(colorKind, color)}
                />
              ))}
            </div>
            <button
              type="button"
              className="markdoc-popover-clear"
              onClick={() => {
                adapter?.run(colorKind === 'text' ? 'clearTextColor' : 'clearBackgroundColor')
                setPopover(null)
              }}
            >
              {t(colorKind === 'text' ? 'editor.clearTextColor' : 'editor.clearBackgroundColor')}
            </button>
          </div>
        )}

        {popover === 'emoji' && (
          <div className="markdoc-toolbar-popover markdoc-emoji-popover" role="dialog" aria-label={t('editor.emoji')} data-placement="top">
            <div className="markdoc-emoji-tabs" role="tablist">
              {EMOJI_GROUPS.map(group => (
                <button
                  key={group.id}
                  type="button"
                  role="tab"
                  aria-selected={emojiGroup === group.id}
                  className="markdoc-emoji-tab"
                  onClick={() => setEmojiGroup(group.id)}
                >
                  {t(`editor.emojiGroups.${group.id}`)}
                </button>
              ))}
            </div>
            <div className="markdoc-emoji-grid">
              {activeEmojiGroup.items.map(emoji => (
                <button
                  key={emoji}
                  type="button"
                  className="markdoc-emoji-button"
                  aria-label={emoji}
                  onClick={() => {
                    adapter?.run('emoji', { text: `${emoji} ` })
                    setPopover(null)
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
