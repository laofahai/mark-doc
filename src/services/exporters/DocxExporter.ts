import { invoke } from '@tauri-apps/api/core'
import { err, ok, type Result } from '../document/errors'
import type { DocumentPageLayout } from '../document/page-layout'

export interface DocxExportInput {
  markdownPath: string
  outputPath: string
  referenceDocx?: string
  builtinTemplate?: 'daily' | 'formal'
  pageLayout?: DocumentPageLayout
}

interface DocxExportCommandResult {
  output_path: string
}

export class DocxExporter {
  async export(input: DocxExportInput): Promise<Result<{ outputPath: string }>> {
    try {
      const result = await invoke<DocxExportCommandResult>('export_workspace_to_docx', {
        input: {
          markdownPath: input.markdownPath,
          outputPath: input.outputPath,
          referenceDocx: input.referenceDocx,
          builtinTemplate: input.builtinTemplate,
          pageLayout: input.pageLayout,
        },
      })
      return ok({ outputPath: result.output_path })
    } catch (cause) {
      return err('export.docxFailed', { messageKey: 'errors.export.docxFailed', cause })
    }
  }
}
