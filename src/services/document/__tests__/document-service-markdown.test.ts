import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readTextFile } from '../../native-file'
import { DocumentService } from '../document-service'

vi.mock('../../native-file', () => ({
  readTextFile: vi.fn(),
}))

describe('DocumentService markdown flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens plain markdown without package metadata', async () => {
    const service = new DocumentService()
    const result = await service.openMarkdown('/docs/readme.md', '# Readme')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.document.source).toEqual({ type: 'markdown', path: '/docs/readme.md' })
      expect(result.value.document.workspace.manifestPath).toBeUndefined()
      expect(result.value.document.markdown).toBe('# Readme')
      expect(result.value.resourceSuggestion).toBeUndefined()
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

  it('flags inline base64 images for non-blocking mdoc suggestion', async () => {
    const service = new DocumentService()
    const result = await service.openMarkdown('/docs/report.md', '![x](data:image/png;base64,AQID)')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.resourceSuggestion).toEqual({
        kind: 'suggest-mdoc',
        references: ['inline-base64-image'],
      })
    }
  })

  it('opens plain text files as editable markdown documents', async () => {
    vi.mocked(readTextFile).mockResolvedValueOnce('plain notes')

    const service = new DocumentService()
    const result = await service.openPath('/docs/notes.txt')

    expect(result.ok).toBe(true)
    expect(readTextFile).toHaveBeenCalledWith('/docs/notes.txt')
    if (result.ok) {
      expect(result.value.document.source).toEqual({ type: 'markdown', path: '/docs/notes.txt' })
      expect(result.value.document.markdown).toBe('plain notes')
    }
  })
})
