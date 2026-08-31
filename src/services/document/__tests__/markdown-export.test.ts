import { beforeEach, describe, expect, it, vi } from 'vitest'
import { selectSavePath, writeTextFile } from '../../native-file'
import { createMarkdownExportDefaultPath, exportMarkdownFile } from '../markdown-export'

vi.mock('../../native-file', () => ({
  selectSavePath: vi.fn(),
  writeTextFile: vi.fn(),
}))

describe('markdown export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    ['report.mdoc', 'report.md'],
    ['report.doc', 'report.md'],
    ['report.docx', 'report.md'],
    ['report.txt', 'report.md'],
    ['', 'untitled.md'],
    [undefined, 'untitled.md'],
  ])('creates a markdown default path from %s', (sourceName, expected) => {
    expect(createMarkdownExportDefaultPath(sourceName)).toBe(expected)
  })

  it('writes markdown with an md extension selected by the user', async () => {
    vi.mocked(selectSavePath).mockResolvedValueOnce('/exports/report')

    await expect(exportMarkdownFile({
      sourceName: 'report.mdoc',
      markdown: '# Report',
      filterName: 'Markdown',
    })).resolves.toBe(true)

    expect(selectSavePath).toHaveBeenCalledWith({
      filters: [{ name: 'Markdown', extensions: ['md'] }],
      defaultPath: 'report.md',
    })
    expect(writeTextFile).toHaveBeenCalledWith('/exports/report.md', '# Report')
  })

  it('does not write when the user cancels export', async () => {
    vi.mocked(selectSavePath).mockResolvedValueOnce(null)

    await expect(exportMarkdownFile({
      sourceName: 'report.mdoc',
      markdown: '# Report',
      filterName: 'Markdown',
    })).resolves.toBe(false)

    expect(writeTextFile).not.toHaveBeenCalled()
  })
})
