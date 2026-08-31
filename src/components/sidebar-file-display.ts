export type SidebarFileKind = 'markdown' | 'markdoc' | 'word' | 'text' | 'unknown'

export interface SidebarFileDisplay {
  label: string
  kind: SidebarFileKind
  ariaLabel: string
  iconClassName: string
}

const EXTENSION_DISPLAY: Record<string, Pick<SidebarFileDisplay, 'kind' | 'ariaLabel' | 'iconClassName'>> = {
  md: { kind: 'markdown', ariaLabel: 'Markdown file', iconClassName: 'text-sky-600 dark:text-sky-400' },
  mdoc: { kind: 'markdoc', ariaLabel: 'MarkDoc package', iconClassName: 'text-violet-600 dark:text-violet-400' },
  doc: { kind: 'word', ariaLabel: 'Word document', iconClassName: 'text-blue-600 dark:text-blue-400' },
  docx: { kind: 'word', ariaLabel: 'Word document', iconClassName: 'text-blue-600 dark:text-blue-400' },
  txt: { kind: 'text', ariaLabel: 'Text file', iconClassName: 'text-slate-500 dark:text-slate-300' },
}

export function getSidebarFileDisplay(name: string): SidebarFileDisplay {
  const match = name.match(/\.([^.]+)$/)
  const extension = match?.[1]?.toLowerCase()
  const known = extension ? EXTENSION_DISPLAY[extension] : undefined
  if (!known || !match) {
    return { label: name, kind: 'unknown', ariaLabel: 'File', iconClassName: 'text-muted-foreground' }
  }

  const label = name.slice(0, match.index)
  return {
    label: label || name,
    ...known,
  }
}
