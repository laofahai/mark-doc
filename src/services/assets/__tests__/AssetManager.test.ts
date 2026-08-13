import { beforeEach, describe, expect, it, vi } from 'vitest'
import { writeFile } from '@tauri-apps/plugin-fs'
import { createTemporaryWorkspace } from '../../document/workspace-service'
import {
  AssetManager,
  containsBase64Images,
  findLocalAssetReferences,
  rewriteBase64ImageReferences,
} from '../AssetManager'

describe('AssetManager', () => {
  beforeEach(() => vi.clearAllMocks())

  it('detects local asset references without treating remote URLs as local assets', () => {
    const markdown = [
      '![local](assets/a.png)',
      '![remote](https://example.com/a.png)',
      '![cdn](//cdn.example/a.png)',
      '![ftp](ftp://example.com/a.png)',
      '![custom](custom-scheme:image.png)',
      '<img src="images/b.jpg" alt="b">',
    ].join('\n')
    expect(findLocalAssetReferences(markdown)).toEqual(['assets/a.png', 'images/b.jpg'])
  })

  it('detects base64 image persistence', () => {
    expect(containsBase64Images('![x](data:image/png;base64,AAAA)')).toBe(true)
    expect(containsBase64Images('![x](assets/a.png)')).toBe(false)
  })

  it('rewrites mapped base64 Markdown image references without touching other images', () => {
    const first = 'data:image/png;base64,AAAA'
    const second = 'data:image/jpeg;base64,BBBB'
    const markdown = [
      `![one](${first})`,
      `![two](${second})`,
      '<img src="data:image/png;base64,AAAA" alt="html">',
      '![remote](https://example.com/a.png)',
    ].join('\n')

    expect(rewriteBase64ImageReferences(markdown, {
      [first]: 'assets/one.png',
      [second]: '//cdn.example/two.jpg',
    })).toBe([
      '![one](assets/one.png)',
      `![two](${second})`,
      '<img src="data:image/png;base64,AAAA" alt="html">',
      '![remote](https://example.com/a.png)',
    ].join('\n'))
  })

  it('imports bytes into workspace assets using relative markdown paths', async () => {
    const workspace = createTemporaryWorkspace('/tmp/markdoc/doc-1', 'test')
    const manager = new AssetManager(workspace)
    const result = await manager.importBytes(new Uint8Array([1, 2, 3]), {
      preferredName: 'Screenshot 1.png',
      mimeType: 'image/png',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.markdownPath).toMatch(/^assets\/screenshot-1-[a-f0-9]{8}\.png$/)
    }
    expect(writeFile).toHaveBeenCalledOnce()
  })
})
