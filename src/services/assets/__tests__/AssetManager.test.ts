import { describe, expect, it } from 'vitest'
import {
  containsBase64Images,
  findLocalAssetReferences,
  rewriteBase64ImageReferences,
} from '../AssetManager'

describe('asset markdown helpers', () => {
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

  it('detects embedded style and html resources without treating plain links as package assets', () => {
    const markdown = [
      '[relative doc](notes/next.md)',
      '<link rel="stylesheet" href="./styles/report.css">',
      '<video src="media/demo.mp4" poster="images/poster.png"></video>',
      '<div style="background-image: url(assets/background.png)">Cover</div>',
      '<style>.hero { background: url("./images/hero.jpg"); }</style>',
      '<script src="https://example.com/remote.js"></script>',
    ].join('\n')

    expect(findLocalAssetReferences(markdown)).toEqual([
      './styles/report.css',
      'media/demo.mp4',
      'images/poster.png',
      'assets/background.png',
      './images/hero.jpg',
    ])
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
})
