import { describe, expect, it } from 'vitest'
import { getEditorOutline } from '../outline'

describe('getEditorOutline', () => {
  it('extracts stable heading ids and ignores fenced code headings', () => {
    expect(getEditorOutline([
      '# Title',
      '',
      '## Repeat',
      '~~~',
      '# Ignored',
      '~~~',
      '## Repeat',
    ].join('\n'))).toEqual([
      { id: 'title-1', level: 1, text: 'Title', line: 1 },
      { id: 'repeat-3', level: 2, text: 'Repeat', line: 3 },
      { id: 'repeat-7', level: 2, text: 'Repeat', line: 7 },
    ])
  })

  it('ignores headings inside YAML frontmatter', () => {
    expect(getEditorOutline([
      '---',
      'title: "# Not a heading"',
      '---',
      '',
      '# Document',
    ].join('\n'))).toEqual([
      { id: 'document-5', level: 1, text: 'Document', line: 5 },
    ])
  })
})
