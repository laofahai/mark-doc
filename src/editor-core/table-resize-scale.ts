import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { columnResizingPluginKey } from '@tiptap/pm/tables'

// ProseMirror's resize plugin consumes screen deltas as document pixels.
// Correct its drag origin before its native window listeners consume each event.
export const ScaledTableResize = Extension.create({
  name: 'scaledTableResize',
  addProseMirrorPlugins() {
    return [new Plugin({
      view(view) {
        const win = view.dom.ownerDocument.defaultView
        if (!win) return {}
        let drag: { startX: number; scale: number } | null = null
        const start = (event: MouseEvent) => {
          drag = null
          const state = columnResizingPluginKey.getState(view.state)
          if (!view.editable || !state || state.activeHandle < 0 || state.dragging || !view.dom.contains(event.target as Node)) return
          const scale = view.dom.getBoundingClientRect().width / view.dom.offsetWidth
          if (Number.isFinite(scale) && scale > 0 && Math.abs(scale - 1) > 0.01) drag = { startX: event.clientX, scale }
        }
        const correct = (event: MouseEvent) => {
          const state = columnResizingPluginKey.getState(view.state)
          if (!drag || !state?.dragging) return
          const width = Math.round(state.dragging.startWidth + (event.clientX - drag.startX) / drag.scale)
          const startX = event.clientX - (width - state.dragging.startWidth)
          view.dispatch(view.state.tr.setMeta(columnResizingPluginKey, {
            setDragging: { ...state.dragging, startX },
          }).setMeta('addToHistory', false))
        }
        const finish = (event: MouseEvent) => { correct(event); drag = null }
        win.addEventListener('mousedown', start, true)
        win.addEventListener('mousemove', correct, true)
        win.addEventListener('mouseup', finish, true)
        return { destroy() {
          win.removeEventListener('mousedown', start, true)
          win.removeEventListener('mousemove', correct, true)
          win.removeEventListener('mouseup', finish, true)
        } }
      },
    })]
  },
})
