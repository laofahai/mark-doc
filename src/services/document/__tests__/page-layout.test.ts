import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_PAGE_LAYOUT,
  buildPrintPageCss,
  getDocumentPageLayout,
  mergePageLayoutIntoManifest,
  normalizePageLayout,
  pageLayoutCssVars,
  printDocument,
} from '../page-layout'
import type { DocumentModel } from '../model'

function documentWithPresentation(presentation: DocumentModel['presentation']): DocumentModel {
  return {
    id: 'doc-1',
    source: { type: 'package', packagePath: '/docs/report.mdoc', extractedWorkspacePath: '/tmp/report' },
    workspace: {
      id: 'workspace-1',
      rootPath: '/tmp/report',
      entryPath: '/tmp/report/document.md',
      storage: { type: 'temporary', rootPath: '/tmp/report', recoveryKey: 'doc-1' },
    },
    markdown: '# Report',
    metadata: {},
    assets: { references: [] },
    presentation,
    dirty: { markdown: false, assets: false, presentation: false },
  }
}

describe('document page layout', () => {
  it('normalizes missing and unsafe manifest page values to the default A4 portrait layout', () => {
    expect(normalizePageLayout(undefined)).toEqual(DEFAULT_PAGE_LAYOUT)
    expect(normalizePageLayout({
      size: 'poster',
      orientation: 'diagonal',
      margins: { top: 'calc(100%)', right: '-1px', bottom: '20mm', left: '999px' },
    })).toEqual(DEFAULT_PAGE_LAYOUT)
  })

  it('reads a package page layout from document presentation', () => {
    expect(getDocumentPageLayout(documentWithPresentation({
      page: {
        size: 'a4',
        orientation: 'landscape',
        margins: { top: '16mm', right: '18mm', bottom: '16mm', left: '18mm' },
      },
    }))).toEqual({
      size: 'a4',
      orientation: 'landscape',
      margins: { top: '16mm', right: '18mm', bottom: '16mm', left: '18mm' },
    })
  })

  it('merges page layout into manifest presentation without dropping existing fields', () => {
    const manifest = mergePageLayoutIntoManifest({
      format: 'markdoc-package',
      version: 1,
      entry: 'content/main.md',
      presentation: {
        print: 'presentation/print.css',
        docxReference: 'presentation/reference.docx',
        theme: 'board',
      },
      custom: { keep: true },
    }, 'content/main.md', {
      size: 'letter',
      orientation: 'landscape',
      margins: { top: '0.5in', right: '0.6in', bottom: '0.5in', left: '0.6in' },
    })

    expect(manifest).toMatchObject({
      format: 'markdoc-package',
      version: 1,
      entry: 'content/main.md',
      schema: expect.stringContaining('markdoc-package-v1.schema.json'),
      spec: expect.stringContaining('markdoc-package-v1.md'),
      presentation: {
        print: 'presentation/print.css',
        docxReference: 'presentation/reference.docx',
        theme: 'board',
        page: {
          size: 'letter',
          orientation: 'landscape',
          margins: { top: '0.5in', right: '0.6in', bottom: '0.5in', left: '0.6in' },
        },
      },
      custom: { keep: true },
    })
  })

  it('maps page layout to editor CSS variables and print @page CSS', () => {
    const layout = {
      size: 'a4' as const,
      orientation: 'landscape' as const,
      margins: { top: '12mm', right: '14mm', bottom: '12mm', left: '14mm' },
    }

    expect(pageLayoutCssVars(layout)).toMatchObject({
      '--markdoc-page-width': '297mm',
      '--markdoc-page-height': '210mm',
      '--markdoc-page-margin-top': '12mm',
      '--markdoc-page-margin-right': '14mm',
      '--markdoc-page-margin-bottom': '12mm',
      '--markdoc-page-margin-left': '14mm',
    })
    expect(buildPrintPageCss(layout)).toContain('@page { size: A4 landscape; margin: 12mm 14mm 12mm 14mm; }')
    expect(buildPrintPageCss(layout)).toContain('.markdoc-document-canvas { display: block !important; min-height: 0 !important; padding: 0 !important; background: #fff !important; }')
  })

  it('installs temporary print CSS, invokes the print dialog, and cleans up after printing', () => {
    const printSpy = vi.fn()
    Object.defineProperty(window, 'print', { configurable: true, value: printSpy })

    printDocument({
      size: 'a4',
      orientation: 'landscape',
      margins: { top: '12mm', right: '14mm', bottom: '12mm', left: '14mm' },
    })

    expect(printSpy).toHaveBeenCalledOnce()
    expect(document.documentElement.dataset.markdocPrinting).toBe('true')
    expect(document.getElementById('markdoc-print-page-style')?.textContent).toContain('size: A4 landscape')

    window.dispatchEvent(new Event('afterprint'))

    expect(document.documentElement.dataset.markdocPrinting).toBeUndefined()
    expect(document.getElementById('markdoc-print-page-style')).toBeNull()
  })
})
