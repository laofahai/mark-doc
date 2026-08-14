import { invoke } from '@tauri-apps/api/core'
import { err, ok, type Result } from '../document/errors'

export interface DocxExportInput {
  markdownPath: string
  outputPath: string
  referenceDocx?: string
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
        },
      })
      return ok({ outputPath: result.output_path })
    } catch (cause) {
      return err('export.docxFailed', { messageKey: 'errors.export.docxFailed', cause })
    }
  }
}
