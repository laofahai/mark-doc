import { lazy, Suspense, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ImportPastedImage } from '../../editor-core/asset-bridge'
import type { LocalResourceUrlResolver } from '../../editor-core/resource-security'
import type { EditorViewMode } from '../sidebar-width'
import {
  DEFAULT_PAGE_LAYOUT,
  normalizePageLayout,
  pageLayoutCssVars,
  type DocumentPageLayout,
} from '../../services/document/page-layout'
import type { PackageSecurityPolicy } from '../../services/security/PackageSecurityPolicy'
import type { DocumentEditorAdapter } from './editor-adapter'
import { EditorPopoverLayer } from './EditorPopoverLayer'
import { EditorToolbar } from './EditorToolbar'
import { TiptapMarkDocEditor } from './TiptapMarkDocEditor'
import { needsVirtualizedEditor } from '../../editor-core/document-size'
import presentation from '../../document-presentation.json'

const SourceEditor = lazy(() => import('./SourceEditor'))

export interface EditorProps {
  content?: string
  onChange?: (markdown: string) => void
  onAdapterReady?: (adapter: DocumentEditorAdapter) => void
  zoom?: number
  viewMode?: EditorViewMode
  pageLayout?: DocumentPageLayout
  securityPolicy?: PackageSecurityPolicy | null
  onImagePaste?: ImportPastedImage
  resolveAssetUrl?: LocalResourceUrlResolver
  status?: ReactNode
}

export function EditorShell({
  content = '',
  onChange,
  onAdapterReady,
  zoom = 100,
  viewMode = 'fit',
  pageLayout = DEFAULT_PAGE_LAYOUT,
  securityPolicy,
  onImagePaste,
  resolveAssetUrl,
  status,
}: EditorProps) {
  const { t } = useTranslation()
  const [adapter, setAdapter] = useState<DocumentEditorAdapter | null>(null)
  const [revision, setRevision] = useState(0)
  const [largeDocument] = useState(() => needsVirtualizedEditor(content))
  const [sourceMode, setSourceMode] = useState(largeDocument)
  const canvasRef = useRef<HTMLDivElement>(null)
  const normalizedPageLayout = normalizePageLayout(pageLayout)
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    const paper = canvas?.querySelector<HTMLElement>('.ProseMirror')
    if (!canvas || !paper || typeof ResizeObserver === 'undefined') return
    const updateFit = () => {
      const style = getComputedStyle(canvas)
      const available = canvas.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      const fit = viewMode === 'fit' && paper.offsetWidth > 0
        ? Math.min(1, Math.max(1, available) / paper.offsetWidth)
        : 1
      canvas.style.setProperty('--editor-fit-scale', String(fit))
    }
    const observer = new ResizeObserver(updateFit)
    observer.observe(canvas)
    observer.observe(paper)
    updateFit()
    return () => observer.disconnect()
  }, [adapter, viewMode, normalizedPageLayout.size, normalizedPageLayout.orientation])
  const shellStyle = {
    '--document-font-size': `${presentation.daily.fontSizePx}px`,
    '--document-line-height': presentation.daily.lineHeight,
    '--document-heading-line-height': presentation.daily.headingLineHeight,
    '--document-heading-before': `${presentation.daily.headingSpaceBeforeEm}em`,
    '--document-heading-after': `${presentation.daily.headingSpaceAfterEm}em`,
    '--document-paragraph-space': `${presentation.daily.paragraphSpacingPx}px`,
    ...Object.fromEntries(presentation.daily.headingSizesPx.map((size, index) => [`--document-h${index + 1}-size`, `${size}px`])),
    ...pageLayoutCssVars(normalizedPageLayout),
    ...(zoom !== 100 ? { '--editor-zoom': zoom / 100 } : {}),
  } as CSSProperties

  return (
    <section
      className="editor-shell markdoc-editor-shell"
      data-testid="markdoc-editor-shell"
      data-markdoc-editor-root
      data-markdoc-print-root
      data-markdoc-view-mode={viewMode}
      data-markdoc-page-size={normalizedPageLayout.size}
      data-markdoc-page-orientation={normalizedPageLayout.orientation}
      style={shellStyle}
    >
      {largeDocument && <div className="markdoc-editor-mode" data-markdoc-print-hidden>
        <span>{t('editor.largeDocument')}</span>
        <div role="group" aria-label={t('editor.documentMode')}>
          <button type="button" aria-pressed={sourceMode} onClick={() => setSourceMode(true)}>{t('editor.sourceMode')}</button>
          <button type="button" aria-pressed={!sourceMode} onClick={() => {
            if (!sourceMode || window.confirm(t('editor.largeFormattedConfirm'))) setSourceMode(false)
          }}>{t('editor.formattedMode')}</button>
        </div>
      </div>}
      {sourceMode ? <Suspense fallback={<div role="status">{t('editor.loading')}</div>}>
        <SourceEditor content={content} onChange={onChange} onAdapterReady={onAdapterReady} onAdapterChange={setAdapter} onImagePaste={onImagePaste} />
      </Suspense> : <>
      <div ref={canvasRef} className="markdoc-document-canvas markdoc-editor-scroll" data-testid="markdoc-document-canvas">
        <TiptapMarkDocEditor
          content={content}
          placeholder={t('editor.placeholder')}
          onChange={onChange}
          onAdapterReady={onAdapterReady}
          onAdapterChange={setAdapter}
          onRevision={() => setRevision(value => value + 1)}
          securityPolicy={securityPolicy}
          onImagePaste={onImagePaste}
          resolveAssetUrl={resolveAssetUrl}
        />
      </div>
      </>}
      <EditorPopoverLayer>
        {!sourceMode && <EditorToolbar adapter={adapter} revision={revision} onImagePaste={onImagePaste} />}
        {status && <div className="markdoc-editor-status">{status}</div>}
      </EditorPopoverLayer>
    </section>
  )
}
