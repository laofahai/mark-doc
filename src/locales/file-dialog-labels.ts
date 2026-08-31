import i18next from 'i18next'

export function localizedText(key: string, defaultValue: string) {
  return i18next.t(key, { defaultValue })
}

export const fileDialogLabels = {
  markdocPackage: () => localizedText('fileFilters.markdocPackage', 'MarkDoc Package'),
  markdown: () => localizedText('fileFilters.markdown', 'Markdown'),
  text: () => localizedText('fileFilters.text', 'Text'),
  word: () => localizedText('fileFilters.word', 'Word'),
}
