import { selectSavePath, writeTextFile } from '../native-file'

interface ExportMarkdownFileOptions {
  sourceName?: string
  markdown: string
  filterName: string
}

export function createMarkdownExportDefaultPath(sourceName?: string) {
  const trimmedName = sourceName?.trim() || 'untitled.md'
  return trimmedName.replace(/\.(mdoc|docx?|txt)$/i, '.md') || 'untitled.md'
}

export async function exportMarkdownFile({ sourceName, markdown, filterName }: ExportMarkdownFileOptions) {
  const outputPath = await selectSavePath({
    filters: [{ name: filterName, extensions: ['md'] }],
    defaultPath: createMarkdownExportDefaultPath(sourceName),
  })
  if (!outputPath) return false
  const finalPath = outputPath.toLowerCase().endsWith('.md') ? outputPath : `${outputPath}.md`
  await writeTextFile(finalPath, markdown)
  return true
}
