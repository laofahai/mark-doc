import type { DocumentModel } from './model'

export type DocumentPageSize = 'a4' | 'letter'
export type DocumentPageOrientation = 'portrait' | 'landscape'

export interface DocumentPageMargins {
  top: string
  right: string
  bottom: string
  left: string
}

export interface DocumentPageLayout {
  size: DocumentPageSize
  orientation: DocumentPageOrientation
  margins: DocumentPageMargins
}

interface ManifestLike {
  format?: unknown
  version?: unknown
  entry?: unknown
  schema?: unknown
  spec?: unknown
  createdBy?: unknown
  presentation?: unknown
  [key: string]: unknown
}

export const MARKDOC_PACKAGE_SCHEMA = 'https://raw.githubusercontent.com/laofahai/mark-doc/main/schemas/markdoc-package-v1.schema.json'
export const MARKDOC_PACKAGE_SPEC = 'https://github.com/laofahai/mark-doc/blob/main/docs/spec/markdoc-package-v1.md'

export const DEFAULT_PAGE_LAYOUT: DocumentPageLayout = {
  size: 'a4',
  orientation: 'portrait',
  margins: { top: '18mm', right: '18mm', bottom: '18mm', left: '18mm' },
}

const PAGE_DIMENSIONS: Record<DocumentPageSize, { width: string; height: string; label: string }> = {
  a4: { width: '210mm', height: '297mm', label: 'A4' },
  letter: { width: '8.5in', height: '11in', label: 'Letter' },
}

const PAGE_SIZE_VALUES = new Set<DocumentPageSize>(['a4', 'letter'])
const ORIENTATION_VALUES = new Set<DocumentPageOrientation>(['portrait', 'landscape'])
const SAFE_MARGIN_PATTERN = /^(?:0(?:\.\d+)?|[1-9]\d?(?:\.\d+)?)(?:mm|cm|in|pt)$/
const PRINT_STYLE_ID = 'markdoc-print-page-style'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isPageSize(value: unknown): value is DocumentPageSize {
  return typeof value === 'string' && PAGE_SIZE_VALUES.has(value as DocumentPageSize)
}

function isPageOrientation(value: unknown): value is DocumentPageOrientation {
  return typeof value === 'string' && ORIENTATION_VALUES.has(value as DocumentPageOrientation)
}

function normalizeMargins(value: unknown): DocumentPageMargins {
  if (!isRecord(value)) return DEFAULT_PAGE_LAYOUT.margins
  const margins = {
    top: typeof value.top === 'string' ? value.top.trim() : '',
    right: typeof value.right === 'string' ? value.right.trim() : '',
    bottom: typeof value.bottom === 'string' ? value.bottom.trim() : '',
    left: typeof value.left === 'string' ? value.left.trim() : '',
  }
  return Object.values(margins).every(margin => SAFE_MARGIN_PATTERN.test(margin))
    ? margins
    : DEFAULT_PAGE_LAYOUT.margins
}

export function normalizePageLayout(value: unknown): DocumentPageLayout {
  if (!isRecord(value)) return DEFAULT_PAGE_LAYOUT
  const size = isPageSize(value.size) ? value.size : DEFAULT_PAGE_LAYOUT.size
  const orientation = isPageOrientation(value.orientation) ? value.orientation : DEFAULT_PAGE_LAYOUT.orientation
  return {
    size,
    orientation,
    margins: normalizeMargins(value.margins),
  }
}

export function pageLayoutEquals(a: DocumentPageLayout, b: DocumentPageLayout) {
  return a.size === b.size
    && a.orientation === b.orientation
    && a.margins.top === b.margins.top
    && a.margins.right === b.margins.right
    && a.margins.bottom === b.margins.bottom
    && a.margins.left === b.margins.left
}

export function pageLayoutFromManifestPresentation(presentation: unknown): DocumentPageLayout | undefined {
  if (!isRecord(presentation) || !('page' in presentation)) return undefined
  return normalizePageLayout(presentation.page)
}

export function getDocumentPageLayout(document: Pick<DocumentModel, 'presentation'> | null | undefined): DocumentPageLayout {
  return normalizePageLayout(document?.presentation.page)
}

export function pageLayoutCssVars(value: unknown): Record<string, string> {
  const layout = normalizePageLayout(value)
  const dimensions = PAGE_DIMENSIONS[layout.size]
  const width = layout.orientation === 'landscape' ? dimensions.height : dimensions.width
  const height = layout.orientation === 'landscape' ? dimensions.width : dimensions.height
  return {
    '--markdoc-page-width': width,
    '--markdoc-page-height': height,
    '--markdoc-page-margin-top': layout.margins.top,
    '--markdoc-page-margin-right': layout.margins.right,
    '--markdoc-page-margin-bottom': layout.margins.bottom,
    '--markdoc-page-margin-left': layout.margins.left,
  }
}

export function mergePageLayoutIntoManifest(
  manifest: unknown,
  entry: string,
  pageLayout: DocumentPageLayout | undefined,
) {
  const source: ManifestLike = isRecord(manifest) ? { ...manifest } : {}
  const presentation = isRecord(source.presentation) ? { ...source.presentation } : {}
  if (pageLayout) presentation.page = normalizePageLayout(pageLayout)

  return {
    ...source,
    format: 'markdoc-package',
    version: 1,
    entry,
    schema: MARKDOC_PACKAGE_SCHEMA,
    spec: MARKDOC_PACKAGE_SPEC,
    createdBy: isRecord(source.createdBy) ? source.createdBy : { name: 'MarkDoc' },
    ...(Object.keys(presentation).length > 0 ? { presentation } : {}),
  }
}

export function buildPrintPageCss(value: unknown) {
  const layout = normalizePageLayout(value)
  const dimensions = PAGE_DIMENSIONS[layout.size]
  const margin = `${layout.margins.top} ${layout.margins.right} ${layout.margins.bottom} ${layout.margins.left}`
  return [
    `@page { size: ${dimensions.label} ${layout.orientation}; margin: ${margin}; }`,
    '@media print {',
    '  html[data-markdoc-printing="true"], html[data-markdoc-printing="true"] body { background: #fff !important; }',
    '  html[data-markdoc-printing="true"] body * { visibility: hidden !important; }',
    '  html[data-markdoc-printing="true"] [data-markdoc-print-root],',
    '  html[data-markdoc-printing="true"] [data-markdoc-print-root] * { visibility: visible !important; }',
    '  html[data-markdoc-printing="true"] [data-markdoc-print-root] { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; min-height: 0 !important; overflow: visible !important; }',
    '  html[data-markdoc-printing="true"] [data-markdoc-print-hidden] { display: none !important; }',
    '  html[data-markdoc-printing="true"] .markdoc-editor-scroll { overflow: visible !important; }',
    '  html[data-markdoc-printing="true"] .markdoc-tiptap-editor .ProseMirror { width: auto !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; border: 0 !important; box-shadow: none !important; transform: none !important; color: #111 !important; background: #fff !important; }',
    '}',
  ].join('\n')
}

export function printDocument(value: unknown) {
  const style = document.createElement('style')
  style.id = PRINT_STYLE_ID
  style.textContent = buildPrintPageCss(value)
  document.getElementById(PRINT_STYLE_ID)?.remove()
  document.head.appendChild(style)
  document.documentElement.dataset.markdocPrinting = 'true'

  const cleanup = () => {
    document.documentElement.removeAttribute('data-markdoc-printing')
    document.getElementById(PRINT_STYLE_ID)?.remove()
    window.removeEventListener('afterprint', cleanup)
  }

  window.addEventListener('afterprint', cleanup)
  try {
    window.print()
  } catch (error) {
    cleanup()
    throw error
  }
}
