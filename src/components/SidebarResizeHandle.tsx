import { useCallback, type PointerEvent } from 'react'
import { nextSidebarWidth } from './sidebar-width'

interface SidebarResizeHandleProps {
  width: number
  onWidthCommit: (width: number) => void
}

export function SidebarResizeHandle({ width, onWidthCommit }: SidebarResizeHandleProps) {
  const handlePointerDown = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const handleElement = event.currentTarget
    const pointerId = event.pointerId
    handleElement.setPointerCapture?.(pointerId)

    const ownerDocument = handleElement.ownerDocument
    const ownerWindow = ownerDocument.defaultView ?? window
    const sidebarElement = ownerDocument
      .querySelector('[data-markdoc-sidebar-content]')
      ?.closest('aside') as HTMLElement | null
    const startClientX = event.clientX
    const startWidth = width
    let latestWidth = startWidth
    let animationFrame: number | null = null
    const previousCursor = ownerDocument.body.style.cursor
    const previousUserSelect = ownerDocument.body.style.userSelect
    const previousSidebarTransition = sidebarElement?.style.transition ?? ''
    const previousSidebarWillChange = sidebarElement?.style.willChange ?? ''

    ownerDocument.body.style.cursor = 'col-resize'
    ownerDocument.body.style.userSelect = 'none'
    if (sidebarElement) {
      sidebarElement.style.transition = 'none'
      sidebarElement.style.willChange = 'width'
    }

    const applyWidth = () => {
      animationFrame = null
      if (sidebarElement) sidebarElement.style.width = `${latestWidth}px`
    }

    const scheduleWidth = (nextWidth: number) => {
      latestWidth = nextWidth
      if (animationFrame !== null) return
      animationFrame = ownerWindow.requestAnimationFrame(applyWidth)
    }

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      scheduleWidth(nextSidebarWidth({ startWidth, startClientX, currentClientX: moveEvent.clientX }))
    }

    const finishDrag = () => {
      if (animationFrame !== null) {
        ownerWindow.cancelAnimationFrame(animationFrame)
        animationFrame = null
        if (sidebarElement) sidebarElement.style.width = `${latestWidth}px`
      }
      ownerDocument.body.style.cursor = previousCursor
      ownerDocument.body.style.userSelect = previousUserSelect
      if (sidebarElement) {
        sidebarElement.style.transition = previousSidebarTransition
        sidebarElement.style.willChange = previousSidebarWillChange
      }
      handleElement.releasePointerCapture?.(pointerId)
      ownerWindow.removeEventListener('pointermove', handlePointerMove)
      ownerWindow.removeEventListener('pointerup', finishDrag)
      ownerWindow.removeEventListener('pointercancel', finishDrag)
      onWidthCommit(latestWidth)
    }

    ownerWindow.addEventListener('pointermove', handlePointerMove)
    ownerWindow.addEventListener('pointerup', finishDrag, { once: true })
    ownerWindow.addEventListener('pointercancel', finishDrag, { once: true })
  }, [onWidthCommit, width])

  return (
    <button
      aria-label="Resize sidebar"
      className="absolute bottom-0 left-[-3px] top-0 z-20 w-1.5 cursor-col-resize touch-none border-0 bg-transparent p-0 outline-none transition-colors hover:bg-primary/25 focus-visible:bg-primary/25"
      onPointerDown={handlePointerDown}
      type="button"
    />
  )
}
