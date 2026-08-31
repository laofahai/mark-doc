import { getCanonicalEditorMarkdown } from './resource-policy'

export type InlineColorKind = 'text' | 'background'

export interface InlineColorOptions {
  kind: InlineColorKind
  onChange?: (markdown: string) => void
}

export interface ApplyInlineColorOptions extends InlineColorOptions {
  color: string
  range?: Range | null
}

export interface ClearInlineColorOptions extends InlineColorOptions {
  range?: Range | null
}

type VditorMode = 'wysiwyg' | 'ir' | 'sv'

interface VditorModeState {
  element: HTMLElement
  range?: Range
}

interface VditorColorInternals {
  currentMode: VditorMode
  wysiwyg?: VditorModeState
  ir?: VditorModeState
  sv?: VditorModeState
}

interface ColorEditor {
  getValue(): string
  vditor?: VditorColorInternals
}

function getInternals(editor: unknown) {
  return (editor as { vditor?: VditorColorInternals }).vditor
}

function getCurrentState(editor: unknown) {
  const internals = getInternals(editor)
  return internals ? internals[internals.currentMode] ?? null : null
}

function nodeInside(parent: ParentNode, node: Node) {
  return parent === node || (parent instanceof Node && parent.contains(node))
}

function rangeInside(parent: ParentNode, range: Range | null | undefined) {
  return Boolean(range && nodeInside(parent, range.startContainer) && nodeInside(parent, range.endContainer))
}

function rangeHasText(range: Range | null | undefined): range is Range {
  return Boolean(range && !range.collapsed && range.toString())
}

function setSelection(range: Range) {
  const selection = window.getSelection()
  if (!selection) return
  selection.removeAllRanges()
  selection.addRange(range)
}

function updateStoredRange(editor: unknown, range: Range) {
  const state = getCurrentState(editor)
  if (state) state.range = range.cloneRange()
}

function getEditableElement(editor: unknown, root: ParentNode) {
  const state = getCurrentState(editor)
  if (state?.element) return state.element
  return root.querySelector?.('.vditor-wysiwyg, .vditor-ir, .vditor-sv') as HTMLElement | null
}

export function getInlineColorEditorRange(editor: unknown, root: ParentNode) {
  const editable = getEditableElement(editor, root)
  const selection = window.getSelection()
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0)
    if (rangeInside(editable ?? root, range)) return range.cloneRange()
  }

  const storedRange = getCurrentState(editor)?.range
  if (rangeInside(editable ?? root, storedRange)) return storedRange!.cloneRange()

  return null
}

function styleProperty(kind: InlineColorKind) {
  return kind === 'text' ? 'color' : 'background-color'
}

function notifyEditorChanged(editor: ColorEditor, _root: ParentNode, onChange?: (markdown: string) => void) {
  // Vditor WYSIWYG input normalization strips raw inline styles.
  // Colors are preserved by reading the styled DOM directly into markdown.
  onChange?.(getCanonicalEditorMarkdown(editor))
}

export function applyInlineColorToEditor(editor: ColorEditor, root: ParentNode, options: ApplyInlineColorOptions) {
  const editable = getEditableElement(editor, root)
  const requestedRange = options.range ?? null
  const range = rangeHasText(requestedRange) && rangeInside(editable ?? root, requestedRange)
    ? requestedRange.cloneRange()
    : getInlineColorEditorRange(editor, root)
  if (!range || range.collapsed || !range.toString()) return false

  setSelection(range)

  const span = document.createElement('span')
  span.setAttribute('style', `${styleProperty(options.kind)}: ${options.color}`)
  span.appendChild(range.extractContents())
  range.insertNode(span)

  const nextRange = document.createRange()
  nextRange.selectNodeContents(span)
  setSelection(nextRange)
  updateStoredRange(editor, nextRange)
  notifyEditorChanged(editor, root, options.onChange)
  return true
}

function elementFromNode(node: Node) {
  return node instanceof HTMLElement ? node : node.parentElement
}

function collectStyledElements(range: Range, root: ParentNode, property: string) {
  const elements = new Set<HTMLElement>()

  const collectAncestors = (node: Node) => {
    let current = elementFromNode(node)
    while (current && nodeInside(root, current)) {
      if (current instanceof HTMLElement && current.style.getPropertyValue(property)) elements.add(current)
      current = current.parentElement
    }
  }

  collectAncestors(range.startContainer)
  collectAncestors(range.endContainer)

  root.querySelectorAll?.('[style]').forEach(element => {
    if (!(element instanceof HTMLElement)) return
    if (!element.style.getPropertyValue(property)) return
    try {
      if (range.intersectsNode(element)) elements.add(element)
    } catch {
      // Ignore detached nodes from stale editor ranges.
    }
  })

  return [...elements]
}

function unwrapIfEmptyStyleSpan(element: HTMLElement) {
  if (element.tagName !== 'SPAN' || element.getAttribute('style')?.trim()) return
  const parent = element.parentNode
  if (!parent) return
  while (element.firstChild) parent.insertBefore(element.firstChild, element)
  parent.removeChild(element)
}

export function clearInlineColorFromEditor(editor: ColorEditor, root: ParentNode, options: ClearInlineColorOptions) {
  const editable = getEditableElement(editor, root)
  const liveRange = getInlineColorEditorRange(editor, root)
  const requestedRange = options.range ?? null
  const range = rangeHasText(liveRange)
    ? liveRange
    : requestedRange && rangeInside(editable ?? root, requestedRange)
      ? requestedRange.cloneRange()
      : liveRange
  if (!range) return false

  const property = styleProperty(options.kind)
  const elements = collectStyledElements(range, editable ?? root, property)
  if (elements.length === 0) return false

  for (const element of elements) {
    element.style.removeProperty(property)
    unwrapIfEmptyStyleSpan(element)
  }

  setSelection(range)
  updateStoredRange(editor, range)
  notifyEditorChanged(editor, root, options.onChange)
  return true
}
