import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Editor from '../Editor'

const destroy = vi.fn()
const focus = vi.fn()

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'zh' },
    t: (key: string) => key,
  }),
}))

vi.mock('vditor', () => ({
  default: class FakeVditor {
    vditor: unknown

    constructor(container: HTMLElement, options: { after?: () => void }) {
      container.classList.add('vditor')
      const toolbar = document.createElement('div')
      toolbar.className = 'vditor-toolbar vditor-toolbar--pin'
      const content = document.createElement('div')
      content.className = 'vditor-content'
      container.appendChild(toolbar)
      container.appendChild(content)

      const editable = document.createElement('div')
      this.vditor = {
        currentMode: 'wysiwyg',
        toolbar: { element: toolbar },
        wysiwyg: { element: editable },
        ir: { element: editable },
        lute: {
          VditorDOM2Md: () => '',
          VditorIRDOM2Md: () => '',
        },
      }
      setTimeout(() => options.after?.(), 0)
    }

    getValue() {
      return ''
    }

    setValue() {}

    focus() {
      focus()
    }

    insertMD() {}

    destroy() {
      destroy()
    }
  },
}))

describe('Editor toolbar placement', () => {
  it('moves the Vditor toolbar into the bottom formatting host', async () => {
    const { container } = render(<Editor content="" />)

    await waitFor(() => {
      expect(container.querySelector('.editor-formatting-toolbar-host .vditor-toolbar')).toBeInTheDocument()
    })
    expect(container.querySelector('.editor-vditor-surface > .vditor-toolbar')).not.toBeInTheDocument()
  })

  it('does not refocus Vditor when the pointer enters the editor shell', async () => {
    const { container } = render(<Editor content="" />)

    await waitFor(() => {
      expect(container.querySelector('.editor-formatting-toolbar-host .vditor-toolbar')).toBeInTheDocument()
    })
    focus.mockClear()
    fireEvent.mouseEnter(container.querySelector('.editor-shell')!)

    expect(focus).not.toHaveBeenCalled()
  })
})
