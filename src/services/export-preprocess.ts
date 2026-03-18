/**
 * 导出 docx 前的预处理：
 * 1. 将 mermaid 等代码块渲染为 PNG 临时文件
 * 2. 将 base64 内联图片提取为 PNG 临时文件
 * 替换为文件路径引用后交给 pandoc。
 */
import { writeFile, remove } from '@tauri-apps/plugin-fs'

// ===== Mermaid 渲染 =====

const DIAGRAM_TYPES = ['mermaid']
const CODE_BLOCK_RE = new RegExp(
  '```(' + DIAGRAM_TYPES.join('|') + ')\\s*\\n([\\s\\S]*?)```',
  'g'
)

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

// ===== Base64 图片提取 =====

/** 匹配 markdown 中的 base64 图片引用 ![alt](data:image/xxx;base64,...) */
const BASE64_IMG_RE = /!\[([^\]]*)\]\((data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,([A-Za-z0-9+/=\s]+))\)/g

function base64ToUint8Array(base64: string): Uint8Array {
  const cleaned = base64.replace(/\s/g, '')
  const binaryStr = atob(cleaned)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i)
  }
  return bytes
}

// ===== 主入口 =====

/**
 * 导出前预处理 markdown：
 * - mermaid 代码块 → PNG 临时文件
 * - base64 内联图片 → PNG/JPG 临时文件
 * @returns 处理后的 markdown 和需要清理的临时文件列表
 */
export async function preprocessForExport(
  markdown: string,
  outputDir?: string,
): Promise<{ markdown: string; tempFiles: string[] }> {
  const dir = outputDir || '/tmp'
  const tempFiles: string[] = []
  let result = markdown

  // 1. 提取 base64 图片为临时文件
  const base64Matches: { full: string; alt: string; ext: string; data: string }[] = []
  let bm: RegExpExecArray | null
  const b64re = new RegExp(BASE64_IMG_RE.source, BASE64_IMG_RE.flags)
  while ((bm = b64re.exec(markdown)) !== null) {
    base64Matches.push({ full: bm[0], alt: bm[1], ext: bm[3].replace('+xml', ''), data: bm[4] })
  }

  for (let i = 0; i < base64Matches.length; i++) {
    const m = base64Matches[i]
    try {
      const ext = m.ext === 'jpeg' ? 'jpg' : m.ext
      const path = `${dir}/.markdoc-img-${i}-${Date.now()}.${ext}`
      const bytes = base64ToUint8Array(m.data)
      await writeFile(path, bytes)
      tempFiles.push(path)
      result = result.replace(m.full, `![${m.alt}](${path})`)
    } catch (err) {
      console.warn(`Failed to extract base64 image ${i}:`, err)
    }
  }

  // 2. 渲染 mermaid 图表为 PNG
  const blocks: { match: string; type: string; code: string }[] = []
  const re = new RegExp(CODE_BLOCK_RE.source, CODE_BLOCK_RE.flags)
  let cm: RegExpExecArray | null
  while ((cm = re.exec(result)) !== null) {
    blocks.push({ match: cm[0], type: cm[1], code: cm[2].trim() })
  }

  if (blocks.length > 0) {
    let mermaid: any
    try {
      mermaid = await getMermaid()
    } catch {
      console.warn('Mermaid not available, skipping diagram rendering')
    }

    if (mermaid) {
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i]
        try {
          const id = `diagram-export-${i}-${Date.now()}`
          const { svg } = await mermaid.render(id, block.code)
          const pngBuffer = await svgToPngBuffer(svg)
          const path = `${dir}/.markdoc-diagram-${i}-${Date.now()}.png`
          await writeFile(path, new Uint8Array(pngBuffer))
          tempFiles.push(path)
          result = result.replace(block.match, `![diagram](${path})`)
        } catch (err) {
          console.warn(`Failed to render diagram ${i}:`, err)
        }
      }
    }
  }

  return { markdown: result, tempFiles }
}

/** 清理临时文件 */
export async function cleanupTempFiles(paths: string[]) {
  for (const p of paths) {
    try { await remove(p) } catch { /* ignore */ }
  }
}
