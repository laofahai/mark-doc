export type EmojiGroupId = 'people' | 'gestures' | 'marks' | 'work' | 'objects'

export interface EmojiGroup {
  id: EmojiGroupId
  items: string[]
}

export type EmojiPickerLabels = Record<EmojiGroupId, string>

export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    id: 'people',
    items: [
      '😀', '😃', '😄', '😁', '😆', '😂', '🤣', '😊',
      '🙂', '😉', '😍', '😘', '😎', '🤔', '🫡', '🤨',
      '😐', '😕', '😮', '😢', '😭', '😡', '😴', '🤯',
    ],
  },
  {
    id: 'gestures',
    items: [
      '👍', '👎', '👏', '🙌', '🙏', '🤝', '💪', '✌️',
      '👌', '🤌', '🤞', '👋', '🤙', '🫶', '☝️', '👇',
      '👈', '👉', '✍️', '🙋',
    ],
  },
  {
    id: 'marks',
    items: [
      '✅', '❌', '⚠️', '❗', '❓', '💯', '🔴', '🟡',
      '🟢', '🔵', '⬆️', '⬇️', '➡️', '⬅️', '⭐', '✨',
      '⭕', '🚫', '🔁', '♻️',
    ],
  },
  {
    id: 'work',
    items: [
      '📌', '📎', '📁', '📄', '📝', '📅', '⏰', '📊',
      '📈', '📉', '📋', '📍', '🏷️', '💬', '📣', '🔔',
      '🔍', '🔗', '📦', '🧾',
    ],
  },
  {
    id: 'objects',
    items: [
      '💡', '🔥', '🚀', '🎉', '❤️', '💙', '💜', '💎',
      '🏆', '🔒', '🔑', '🧩', '🛠️', '⚙️', '🌐', '☁️',
      '📷', '🎯', '☕', '🌟',
    ],
  },
]

export function getEmojiCount(groups: EmojiGroup[] = EMOJI_GROUPS) {
  return groups.reduce((count, group) => count + group.items.length, 0)
}

export function createEmojiPickerPanel({
  labels,
  groups = EMOJI_GROUPS,
  onSelect,
}: {
  labels: EmojiPickerLabels
  groups?: EmojiGroup[]
  onSelect: (emoji: string) => void
}) {
  const panel = document.createElement('div')
  panel.className = 'emoji-picker-panel'
  panel.addEventListener('click', event => event.stopPropagation())

  const tabs = document.createElement('div')
  tabs.className = 'emoji-picker-panel__tabs'
  tabs.setAttribute('role', 'tablist')

  const grid = document.createElement('div')
  grid.className = 'emoji-picker-panel__grid'

  const tabButtons = new Map<EmojiGroupId, HTMLButtonElement>()
  const renderGroup = (activeGroup: EmojiGroup) => {
    grid.replaceChildren()
    for (const emoji of activeGroup.items) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'emoji-picker-panel__emoji'
      button.dataset.emojiButton = emoji
      button.setAttribute('aria-label', emoji)
      button.textContent = emoji
      button.addEventListener('click', event => {
        event.stopPropagation()
        onSelect(emoji)
      })
      grid.appendChild(button)
    }
  }

  const setActiveGroup = (activeId: EmojiGroupId) => {
    const activeGroup = groups.find(group => group.id === activeId) ?? groups[0]
    if (!activeGroup) return
    for (const [groupId, button] of tabButtons) {
      button.setAttribute('aria-selected', String(groupId === activeGroup.id))
    }
    renderGroup(activeGroup)
  }

  for (const group of groups) {
    const tab = document.createElement('button')
    tab.type = 'button'
    tab.className = 'emoji-picker-panel__tab'
    tab.dataset.emojiTab = group.id
    tab.setAttribute('role', 'tab')
    tab.textContent = labels[group.id]
    tab.addEventListener('click', event => {
      event.stopPropagation()
      setActiveGroup(group.id)
    })
    tabButtons.set(group.id, tab)
    tabs.appendChild(tab)
  }

  panel.appendChild(tabs)
  panel.appendChild(grid)
  setActiveGroup(groups[0]?.id ?? 'people')
  return panel
}
