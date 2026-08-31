import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SidebarDocumentIcon } from '../sidebar-document-icons'
import type { SidebarFileKind } from '../sidebar-file-display'

describe('SidebarDocumentIcon', () => {
  it.each([
    ['markdoc', 'MarkDoc package'],
    ['word', 'Word document'],
    ['markdown', 'Markdown file'],
    ['text', 'Text file'],
    ['unknown', 'File'],
  ] satisfies Array<[SidebarFileKind, string]>)('renders a custom SVG icon for %s files', (kind, label) => {
    const { container } = render(
      <SidebarDocumentIcon ariaLabel={label} className="text-blue-600" kind={kind} size={14} />,
    )

    expect(screen.getByRole('img', { name: label })).toBeInTheDocument()
    expect(container.querySelector('svg[data-sidebar-document-icon]')).toHaveAttribute('data-kind', kind)
    expect(container.querySelector('.lucide')).not.toBeInTheDocument()
  })
})
