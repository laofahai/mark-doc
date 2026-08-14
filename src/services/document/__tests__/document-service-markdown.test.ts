import { describe, expect, it } from 'vitest'
import { DocumentService } from '../document-service'

describe('DocumentService markdown flow', () => {
  it('opens plain markdown without package metadata', async () => {
    const service = new DocumentService()
    const result = await service.openMarkdown('/docs/readme.md', '# Readme')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.document.source).toEqual({ type: 'markdown', path: '/docs/readme.md' })
      expect(result.value.document.workspace.manifestPath).toBeUndefined()
      expect(result.value.document.markdown).toBe('# Readme')
    }
  })

  it('flags local resource references for non-blocking mdoc suggestion', async () => {
    const service = new DocumentService()
    const result = await service.openMarkdown('/docs/report.md', '![x](images/a.png)')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.resourceSuggestion).toEqual({
        kind: 'suggest-mdoc',
        references: ['images/a.png'],
      })
    }
  })
})
