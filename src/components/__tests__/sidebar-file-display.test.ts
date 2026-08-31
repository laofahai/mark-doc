import { describe, expect, it } from 'vitest'
import { getSidebarFileDisplay } from '../sidebar-file-display'

describe('sidebar file display', () => {
  it('hides known document extensions while keeping the base name', () => {
    expect(getSidebarFileDisplay('实施方案.md')).toMatchObject({
      label: '实施方案',
      kind: 'markdown',
      iconClassName: 'text-sky-600 dark:text-sky-400',
    })
    expect(getSidebarFileDisplay('实施方案.mdoc')).toMatchObject({
      label: '实施方案',
      kind: 'markdoc',
      iconClassName: 'text-violet-600 dark:text-violet-400',
    })
    expect(getSidebarFileDisplay('实施方案.docx')).toMatchObject({
      label: '实施方案',
      kind: 'word',
      iconClassName: 'text-blue-600 dark:text-blue-400',
    })
    expect(getSidebarFileDisplay('实施方案.doc')).toMatchObject({
      label: '实施方案',
      kind: 'word',
      iconClassName: 'text-blue-600 dark:text-blue-400',
    })
    expect(getSidebarFileDisplay('实施方案.txt')).toMatchObject({
      label: '实施方案',
      kind: 'text',
      iconClassName: 'text-slate-500 dark:text-slate-300',
    })
  })

  it('handles uppercase extensions and keeps dotted base names', () => {
    expect(getSidebarFileDisplay('2026.05.06 上线.MDOC')).toEqual({
      label: '2026.05.06 上线',
      kind: 'markdoc',
      ariaLabel: 'MarkDoc package',
      iconClassName: 'text-violet-600 dark:text-violet-400',
    })
  })

  it('does not strip unrelated suffixes', () => {
    expect(getSidebarFileDisplay('archive.md.backup')).toEqual({
      label: 'archive.md.backup',
      kind: 'unknown',
      ariaLabel: 'File',
      iconClassName: 'text-muted-foreground',
    })
  })
})
