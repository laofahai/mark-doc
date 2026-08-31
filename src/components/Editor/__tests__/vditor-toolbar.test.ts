import { describe, expect, it } from 'vitest'
import { createVditorFormattingToolbar } from '../vditor-toolbar'

const button = (name: string) => ({ name, icon: `<svg data-name="${name}" />`, tipPosition: 's' as const })

const toolbarNames = (toolbar: ReturnType<typeof createVditorFormattingToolbar>) => (
  toolbar.map(item => item === '|' ? item : item.name)
)

describe('createVditorFormattingToolbar', () => {
  it('keeps document-level commands out of the Vditor toolbar', () => {
    const toolbar = toolbarNames(createVditorFormattingToolbar(button, {
      name: 'font-color',
      icon: '<svg />',
      tip: 'Font Color',
      tipPosition: 's',
      click: () => {},
    }, {
      name: 'markdoc-emoji',
      icon: '<svg />',
      tip: 'Emoji',
      tipPosition: 's',
      click: () => {},
    }))

    expect(toolbar).not.toContain('export')
    expect(toolbar).not.toContain('edit-mode')
    expect(toolbar).not.toContain('outline')
    expect(toolbar).not.toContain('fullscreen')
    expect(toolbar).not.toContain('outdent')
    expect(toolbar).not.toContain('indent')
    expect(toolbar).not.toContain('undo')
    expect(toolbar).not.toContain('redo')
  })

  it('keeps only high-value formatting and insert controls in the editor toolbar', () => {
    const colorPicker = {
      name: 'font-color',
      icon: '<svg />',
      tip: 'Font Color',
      tipPosition: 's' as const,
      click: () => {},
    }
    const emojiPicker = {
      name: 'markdoc-emoji',
      icon: '<svg />',
      tip: 'Emoji',
      tipPosition: 's' as const,
      click: () => {},
    }

    expect(toolbarNames(createVditorFormattingToolbar(button, colorPicker, emojiPicker))).toEqual([
      'headings', 'bold', 'italic', 'strike',
      '|',
      'quote', 'list', 'ordered-list', 'check',
      '|',
      'code', 'inline-code', 'link', 'table', 'upload',
      '|',
      'font-color', 'line', 'markdoc-emoji',
    ])
  })
})
