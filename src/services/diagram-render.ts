/**
 * 导出 docx 前的图表预处理：
 * 将 mermaid 等代码块渲染为 PNG 临时文件，
 * 替换为 markdown 图片引用，再交给 pandoc。
 *
 * 利用 Vditor 自带的 mermaid 库，无额外依赖。
 */
import { writeFile, remove } from '@tauri-apps/plugin-fs'

/** 支持的图表代码块类型 */
const DIAGRAM_TYPES = ['mermaid']

/** 匹配 ```type\n...\n``` 代码块 */
const CODE_BLOCK_RE = new RegExp(
  '```(' + DIAGRAM_TYPES.join('|') + ')\\s*\\n([\\s\\S]*?)```',
  'g'
)

/** 动态加载 mermaid（Vditor 自带） */
async function getMermaid(): Promise<any> {
  // @ts-ignore
  if (window.mermaid) return window.mermaid
  await import('vditor/dist/js/mermaid/mermaid.min.js')
  // @ts-ignore
  const m = window.mermaid
  if (m) {
    m.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' })
  }
  return m
}

/** 将 SVG 字符串转为 PNG ArrayBuffer */
async function svgToPngBuffer(svgStr: string, scale = 2): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)

    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      const ctx = canvas.getContext('2d')!
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)

      canvas.toBlob(blob => {
        if (!blob) return reject(new Error('Canvas toBlob failed'))
        blob.arrayBuffer().then(resolve).catch(reject)
      }, 'image/png')
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('SVG to image failed'))
    }

    img.src = url
  })
}

/**
 * 预处理 markdown：将图表代码块渲染为 PNG 临时文件。
 * @param outputDir 临时文件存放目录（通常和 docx 输出同目录）
 * @returns { markdown, tempFiles } 处理后的 markdown 和临时文件路径列表
 */
export async function preprocessDiagrams(
  markdown: string,
  outputDir?: string,
): Promise<{ markdown: string; tempFiles: string[] }> {
  const blocks: { match: string; type: string; code: string }[] = []
  const tempFiles: string[] = []

  const re = new RegExp(CODE_BLOCK_RE.source, CODE_BLOCK_RE.flags)
  let m: RegExpExecArray | null
  while ((m = re.exec(markdown)) !== null) {
    blocks.push({ match: m[0], type: m[1], code: m[2].trim() })
  }

  if (blocks.length === 0) return { markdown, tempFiles }

  let mermaid: any
  try {
    mermaid = await getMermaid()
  } catch (err) {
    console.warn('Mermaid not available, skipping diagram rendering:', err)
    return { markdown, tempFiles }
  }

  if (!mermaid) return { markdown, tempFiles }

  // 确定临时文件目录
  const dir = outputDir || '/tmp'

  let result = markdown

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]

    try {
      const id = `diagram-export-${i}-${Date.now()}`
      const { svg } = await mermaid.render(id, block.code)

      // SVG → PNG buffer
      const pngBuffer = await svgToPngBuffer(svg)

      // 写入临时文件
      const pngPath = `${dir}/.markdoc-diagram-${i}-${Date.now()}.png`
      await writeFile(pngPath, new Uint8Array(pngBuffer))
      tempFiles.push(pngPath)

      // 替换代码块为图片引用
      result = result.replace(block.match, `![diagram](${pngPath})`)
    } catch (err) {
      console.warn(`Failed to render diagram block ${i}:`, err)
    }
  }

  return { markdown: result, tempFiles }
}

/** 清理临时图表文件 */
export async function cleanupDiagramFiles(paths: string[]) {
  for (const p of paths) {
    try { await remove(p) } catch { /* ignore */ }
  }
}
