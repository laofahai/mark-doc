import { describe, expect, it, vi } from 'vitest'
import { createEmojiPickerPanel, EMOJI_GROUPS, getEmojiCount } from '../emoji-picker'

const labels = {
  people: '表情',
  gestures: '手势',
  marks: '标记',
  work: '工作',
  objects: '物件',
}

describe('emoji picker', () => {
  it('provides a categorized emoji set larger than a tiny quick list', () => {
    expect(EMOJI_GROUPS.map(group => group.id)).toEqual(['people', 'gestures', 'marks', 'work', 'objects'])
    expect(getEmojiCount(EMOJI_GROUPS)).toBeGreaterThanOrEqual(80)
    expect(EMOJI_GROUPS.every(group => group.items.length >= 12)).toBe(true)
  })

  it('renders category tabs without the Vditor hover tail text', () => {
    const panel = createEmojiPickerPanel({ labels, onSelect: vi.fn() })

    expect(panel.querySelectorAll('[data-emoji-tab]')).toHaveLength(5)
    expect(panel.querySelectorAll('[data-emoji-button]').length).toBeGreaterThanOrEqual(12)
    expect(panel.querySelector('.vditor-emojis__tail')).toBeNull()
    expect(panel.querySelector('.vditor-emojis__tip')).toBeNull()
  })

  it('switches category contents and selects emoji directly', () => {
    const onSelect = vi.fn()
    const panel = createEmojiPickerPanel({ labels, onSelect })
    document.body.replaceChildren(panel)

    panel.querySelector('[data-emoji-tab="work"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(panel.querySelector('[data-emoji-tab="work"]')).toHaveAttribute('aria-selected', 'true')
    const pinButton = Array.from(panel.querySelectorAll('[data-emoji-button]'))
      .find(button => button.textContent === '📌')
    expect(pinButton).toBeInTheDocument()

    pinButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onSelect).toHaveBeenCalledWith('📌')
  })
})
