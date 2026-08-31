export interface VditorToolbarButton {
  name: string
  icon?: string
  tip?: string
  tipPosition?: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
  click?: (event: Event) => void
}

export type VditorToolbarEntry = VditorToolbarButton | '|'

export function createVditorFormattingToolbar(
  button: (name: string) => VditorToolbarButton,
  colorPicker: VditorToolbarButton,
  emojiPicker: VditorToolbarButton,
): VditorToolbarEntry[] {
  return [
    button('headings'), button('bold'), button('italic'), button('strike'),
    '|',
    button('quote'), button('list'), button('ordered-list'), button('check'),
    '|',
    button('code'), button('inline-code'), button('link'), button('table'), button('upload'),
    '|',
    colorPicker, button('line'), emojiPicker,
  ]
}
