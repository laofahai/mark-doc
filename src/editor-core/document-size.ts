export function needsVirtualizedEditor(markdown: string) {
  if (markdown.length >= 1_000_000) return true
  let lines = 1
  for (let index = 0; index < markdown.length; index += 1) {
    if (markdown.charCodeAt(index) === 10 && ++lines >= 10_000) return true
  }
  return false
}
