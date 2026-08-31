import { describe, expect, it, vi } from 'vitest'
import { applyInlineColorToEditor, clearInlineColorFromEditor } from '../color-formatting'

function selectText(node: Text, start: number, end: number) {
  const range = document.createRange()
  range.setStart(node, start)
  range.setEnd(node, end)
  return range
}

function setupWysiwygEditor(html = '<p data-block="0">Draft text</p>') {
  document.body.innerHTML = '<div id="root"><button id="toolbar">toolbar</button><div class="vditor-wysiwyg"></div></div>'
  const root = document.getElementById('root')!
  const toolbar = document.getElementById('toolbar')!
  const editable = root.querySelector('.vditor-wysiwyg') as HTMLElement
  editable.innerHTML = html

  const text = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT).nextNode() as Text
  const storedRange = selectText(text, 0, 5)
  const toolbarRange = document.createRange()
  toolbarRange.selectNodeContents(toolbar)
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(toolbarRange)

  const editor = {
    vditor: {
      currentMode: 'wysiwyg',
      wysiwyg: { element: editable, range: storedRange },
      ir: { element: editable },
      lute: {
        VditorDOM2Md: (value: string) => value,
        VditorIRDOM2Md: (value: string) => value,
      },
    },
    getValue: () => editable.innerHTML,
  }

  return { root, editable, editor }
}

describe('color formatting in WYSIWYG', () => {
  it('uses the stored Vditor WYSIWYG range when toolbar click steals browser selection', () => {
    const { root, editable, editor } = setupWysiwygEditor()
    const onChange = vi.fn()

    const applied = applyInlineColorToEditor(editor, root, {
      kind: 'text',
      color: '#dc2626',
      onChange,
    })

    const span = editable.querySelector('span')!
    expect(applied).toBe(true)
    expect(span.getAttribute('style')).toContain('color: #dc2626')
    expect(span.textContent).toBe('Draft')
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('color: #dc2626'))
  })

  it('can apply background color without using an apply button flow', () => {
    const { root, editable, editor } = setupWysiwygEditor()
    const onChange = vi.fn()

    const applied = applyInlineColorToEditor(editor, root, {
      kind: 'background',
      color: '#fde68a',
      onChange,
    })

    const span = editable.querySelector('span')!
    expect(applied).toBe(true)
    expect(span.getAttribute('style')).toContain('background-color: #fde68a')
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('background-color: #fde68a'))
  })

  it('falls back to the live editor selection when a cached range is collapsed', () => {
    const { root, editable, editor } = setupWysiwygEditor()
    const text = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT).nextNode() as Text
    const liveRange = selectText(text, 0, 5)
    const collapsedCachedRange = selectText(text, 0, 0)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(liveRange)

    const applied = applyInlineColorToEditor(editor, root, {
      kind: 'text',
      color: '#dc2626',
      range: collapsedCachedRange,
    })

    const span = editable.querySelector('span')!
    expect(applied).toBe(true)
    expect(span.textContent).toBe('Draft')
    expect(span.style.color).not.toBe('')
  })

  it('does not trigger Vditor input normalization that strips inline color styles', () => {
    const { root, editable, editor } = setupWysiwygEditor()
    editable.addEventListener('input', () => {
      editable.innerHTML = '<p data-block="0">Draft text</p>'
    })

    const applied = applyInlineColorToEditor(editor, root, {
      kind: 'text',
      color: '#dc2626',
    })

    expect(applied).toBe(true)
    expect(editable.querySelector('span[style*="color"]')).not.toBeNull()
  })

  it('clears only the requested color style from the current selection', () => {
    const { root, editable, editor } = setupWysiwygEditor(
      '<p data-block="0"><span style="color: #dc2626; background-color: #fde68a">Draft text</span></p>'
    )
    const onChange = vi.fn()

    const cleared = clearInlineColorFromEditor(editor, root, {
      kind: 'text',
      onChange,
    })

    const span = editable.querySelector('span')!
    expect(cleared).toBe(true)
    expect(span.style.color).toBe('')
    expect(span.style.backgroundColor).not.toBe('')
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('background-color'))
  })
})
