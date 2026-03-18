import { writeTextFile, remove } from '@tauri-apps/plugin-fs'
import { save } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'

export interface FileMetadata {
  path: string
  name: string
  sourceType?: 'md' | 'docx'
}

/** 删除临时文件（忽略错误） */
async function removeTempFile(path: string) {
  try { await remove(path) } catch { /* ignore */ }
}

/**
 * 通过 Pandoc 将 markdown 转换为 docx
 * @param referenceDocxPath 可选，指定 --reference-doc（打开的 docx 原文件路径）
 *   - 有值：使用该文件作为样式 reference（保留原 docx 样式）
 *   - 无值：后端自动使用内置 reference.docx
 */
async function convertMdToDocx(markdown: string, outputPath: string, referenceDocxPath?: string): Promise<boolean> {
  const tempMdPath = outputPath.replace(/\.docx$/i, '.tmp.md')
  await writeTextFile(tempMdPath, markdown)
  try {
    const extraArgs: string[] = []
    // 如果指定了 reference，传给后端覆盖默认的
    if (referenceDocxPath) {
      extraArgs.push('--reference-doc', referenceDocxPath)
    }
    const result = await invoke<{ success: boolean; error?: string }>('pandoc_convert_file', {
      inputPath: tempMdPath,
      outputPath,
      extraArgs: extraArgs.length > 0 ? extraArgs : null,
    })
    if (!result.success) {
      console.error('Pandoc convert failed:', result.error)
      return false
    }
    return true
  } finally {
    await removeTempFile(tempMdPath)
  }
}

/** 保存为 Markdown */
export async function saveAsMarkdown(markdown: string, defaultName = 'untitled.md'): Promise<FileMetadata | null> {
  const filePath = await save({
    filters: [{ name: 'Markdown', extensions: ['md'] }],
    defaultPath: defaultName.replace(/\.docx$/i, '.md'),
  })
  if (!filePath) return null

  await writeTextFile(filePath as string, markdown)
  return {
    path: filePath as string,
    name: (filePath as string).split('/').pop() || defaultName,
    sourceType: 'md',
  }
}

/** 保存为 Word（markdown -> 临时文件 -> Pandoc -> docx） */
export async function saveAsDocx(markdown: string, defaultName = 'untitled.docx', referenceDocxPath?: string): Promise<FileMetadata | null> {
  const filePath = await save({
    filters: [{ name: 'Word', extensions: ['docx'] }],
    defaultPath: defaultName.replace(/\.md$/i, '.docx'),
  })
  if (!filePath) return null

  const ok = await convertMdToDocx(markdown, filePath as string, referenceDocxPath)
  if (!ok) return null

  return {
    path: filePath as string,
    name: (filePath as string).split('/').pop() || defaultName,
    sourceType: 'docx',
  }
}

/** 保存到已有路径 */
export async function saveFile(path: string, markdown: string, referenceDocxPath?: string): Promise<boolean> {
  try {
    if (path.toLowerCase().endsWith('.docx')) {
      return await convertMdToDocx(markdown, path, referenceDocxPath)
    } else {
      await writeTextFile(path, markdown)
      return true
    }
  } catch (error) {
    console.error('Failed to save file:', error)
    return false
  }
}
