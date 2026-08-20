import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { readTextFile } from '@tauri-apps/plugin-fs'
import { containsBase64Images, findLocalAssetReferences } from '../../assets/AssetManager'
import { DocxImporter } from '../../importers/DocxImporter'

describe('source quality', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('treats base64 image blobs as migration input, not acceptable default output', () => {
    const imported = '![x](data:image/png;base64,AAAA)'
    expect(containsBase64Images(imported)).toBe(true)
  })

  it('accepts clean relative asset references', () => {
    const markdown = '![x](assets/image-001.png)'
    expect(containsBase64Images(markdown)).toBe(false)
    expect(findLocalAssetReferences(markdown)).toEqual(['assets/image-001.png'])
  })

  it('keeps imported DOCX images as extracted local asset references', async () => {
    const markdown = '![x](assets/image-001.png)'
    vi.mocked(invoke).mockResolvedValueOnce({
      workspace_root: '/tmp/markdoc/doc-3',
      markdown_path: '/tmp/markdoc/doc-3/document.md',
      assets_path: '/tmp/markdoc/doc-3/assets',
    })
    vi.mocked(readTextFile).mockResolvedValueOnce(markdown)

    const result = await new DocxImporter().import('/docs/report.docx', '/tmp/markdoc/doc-3')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(containsBase64Images(result.value.markdown)).toBe(false)
      expect(findLocalAssetReferences(result.value.markdown)).toEqual(['assets/image-001.png'])
    }
  })
})
