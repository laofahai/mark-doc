import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SidebarResizeHandle } from '../SidebarResizeHandle'

describe('SidebarResizeHandle', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  })

  it('updates the sidebar width during drag and commits once on pointer up', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    const onWidthCommit = vi.fn()
    const { container } = render(
      <div>
        <aside>
          <div data-markdoc-sidebar-content />
        </aside>
        <main>
          <SidebarResizeHandle width={220} onWidthCommit={onWidthCommit} />
        </main>
      </div>,
    )

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Resize sidebar' }), { clientX: 300 })
    expect(container.querySelector('aside')).toHaveStyle({ transition: 'none' })

    fireEvent.pointerMove(window, { clientX: 360 })

    expect(container.querySelector('aside')).toHaveStyle({ width: '280px' })
    expect(onWidthCommit).not.toHaveBeenCalled()

    fireEvent.pointerUp(window)

    expect(container.querySelector('aside')).toHaveStyle({ transition: '' })
    expect(onWidthCommit).toHaveBeenCalledTimes(1)
    expect(onWidthCommit).toHaveBeenCalledWith(280)
  })
})
