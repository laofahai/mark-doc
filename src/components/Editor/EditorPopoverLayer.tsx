import type { ReactNode } from 'react'

interface EditorPopoverLayerProps {
  children: ReactNode
}

export function EditorPopoverLayer({ children }: EditorPopoverLayerProps) {
  return (
    <div className="markdoc-editor-popover-layer">
      {children}
    </div>
  )
}
