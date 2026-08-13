import { writeFile } from '@tauri-apps/plugin-fs'
import { err, ok, type Result } from '../document/errors'
import type { DocumentWorkspace } from '../document/model'
import { resolveWorkspacePath } from '../document/workspace-service'

export interface AssetRef {
  markdownPath: string
  absolutePath: string
  kind: 'image' | 'attachment' | 'data' | 'other'
  mimeType?: string
}

interface ImportBytesOptions {
  preferredName: string
  mimeType?: string
}

const MD_IMAGE_RE = /!\[[^\]]*\]\(([^)]+)\)/g
const HTML_IMG_RE = /<img\s[^>]*src=["']([^"']+)["'][^>]*>/g
const BASE64_IMAGE_RE = /data:image\/[a-zA-Z0-9.+-]+;base64,/i

function isRemoteOrData(path: string) {
  return /^(https?:|data:|file:)/i.test(path)
}

function slugifyName(name: string) {
  const dot = name.lastIndexOf('.')
  const base = dot >= 0 ? name.slice(0, dot) : name
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : 'bin'
  const slug = base
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'asset'
  return { slug, ext }
}

function shortHash(bytes: Uint8Array) {
  let hash = 2166136261
  for (const byte of bytes) {
    hash ^= byte
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function containsBase64Images(markdown: string) {
  return BASE64_IMAGE_RE.test(markdown)
}

export function findLocalAssetReferences(markdown: string) {
  const refs = new Set<string>()
  for (const re of [new RegExp(MD_IMAGE_RE), new RegExp(HTML_IMG_RE)]) {
    let match: RegExpExecArray | null
    while ((match = re.exec(markdown)) !== null) {
      const path = match[1].trim()
      if (path && !isRemoteOrData(path)) refs.add(path)
    }
  }
  return [...refs]
}

export class AssetManager {
  constructor(private workspace: DocumentWorkspace) {}

  async importBytes(bytes: Uint8Array, options: ImportBytesOptions): Promise<Result<AssetRef>> {
    const { slug, ext } = slugifyName(options.preferredName)
    const markdownPath = `assets/${slug}-${shortHash(bytes)}.${ext}`
    const resolved = resolveWorkspacePath(this.workspace, markdownPath)
    if (!resolved.ok) return resolved
    try {
      await writeFile(resolved.value, bytes)
    } catch (cause) {
      return err('assets.writeFailed', { cause })
    }
    return ok({
      markdownPath,
      absolutePath: resolved.value,
      kind: options.mimeType?.startsWith('image/') ? 'image' : 'attachment',
      mimeType: options.mimeType,
    })
  }
}
