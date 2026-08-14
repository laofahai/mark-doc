import type { AssetRef } from '../../services/assets/AssetManager'

export interface EditorLocaleConfig {
  uiLanguage: 'zh' | 'en'
  editorLanguage: 'zh_CN' | 'en_US'
  documentLanguage?: string
}

export interface DocumentEditorAdapter {
  getMarkdown(): string
  setMarkdown(markdown: string): void
  focus(): void
  insertImage(asset: AssetRef): void
  insertAttachment(asset: AssetRef): void
}
