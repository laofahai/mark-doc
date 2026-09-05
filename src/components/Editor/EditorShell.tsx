import { useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import type { ImportPastedImage } from '../../editor-core/asset-bridge'
import type { LocalResourceUrlResolver } from '../../editor-core/resource-security'
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

export interface EditorProps {
  content?: string
  onChange?: (markdown: string) => void
  onAdapterReady?: (adapter: DocumentEditorAdapter) => void
  zoom?: number
  pageLayout?: DocumentPageLayout
  securityPolicy?: PackageSecurityPolicy | null
  onImagePaste?: ImportPastedImage
  resolveAssetUrl?: LocalResourceUrlResolver
}

export function EditorShell({
  content = '',
  onChange,
  onAdapterReady,
  zoom = 100,
  pageLayout = DEFAULT_PAGE_LAYOUT,
  securityPolicy,
  onImagePaste,
  resolveAssetUrl,
}: EditorProps) {
  const { t } = useTranslation()
  const [adapter, setAdapter] = useState<DocumentEditorAdapter | null>(null)
  const [revision, setRevision] = useState(0)
  const normalizedPageLayout = normalizePageLayout(pageLayout)
  const shellStyle = {
    ...pageLayoutCssVars(normalizedPageLayout),
    ...(zoom !== 100 ? { '--editor-zoom': zoom / 100 } : {}),
  } as CSSProperties

  return (
    <section
      className="editor-shell markdoc-editor-shell"
      data-testid="markdoc-editor-shell"
      data-markdoc-editor-root
      data-markdoc-print-root
      data-markdoc-page-size={normalizedPageLayout.size}
      data-markdoc-page-orientation={normalizedPageLayout.orientation}
      style={shellStyle}
    >
      <div className="markdoc-editor-scroll">
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
      <EditorPopoverLayer>
        <EditorToolbar adapter={adapter} revision={revision} onImagePaste={onImagePaste} />
      </EditorPopoverLayer>
    </section>
  )
}
