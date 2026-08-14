import type { AssetRef } from '../../services/assets/AssetManager'
import type { DocumentEditorAdapter } from './editor-adapter'

interface VditorLike {
  getValue(): string
  setValue(markdown: string): void
  focus(): void
  insertValue(markdown: string): void
}

export class VditorEditorAdapter implements DocumentEditorAdapter {
  constructor(private vditor: VditorLike) {}

  getMarkdown() {
    return this.vditor.getValue()
  }

  setMarkdown(markdown: string) {
    this.vditor.setValue(markdown)
  }

  focus() {
    this.vditor.focus()
  }

  insertImage(asset: AssetRef) {
    this.vditor.insertValue(`![image](${asset.markdownPath})`)
  }

  insertAttachment(asset: AssetRef) {
    this.vditor.insertValue(`[${asset.markdownPath}](${asset.markdownPath})`)
  }
}
