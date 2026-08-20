import { describe, expect, it } from 'vitest'
import { containsBase64Images, findLocalAssetReferences } from '../../assets/AssetManager'

describe('source quality', () => {
  it('treats base64 image blobs as migration input, not acceptable default output', () => {
    const imported = '![x](data:image/png;base64,AAAA)'
    expect(containsBase64Images(imported)).toBe(true)
  })

  it('accepts clean relative asset references', () => {
    const markdown = '![x](assets/image-001.png)'
    expect(containsBase64Images(markdown)).toBe(false)
    expect(findLocalAssetReferences(markdown)).toEqual(['assets/image-001.png'])
  })
})
