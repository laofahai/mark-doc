import { useRef, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { SidebarOutlineItem } from './sidebar-outline'

export function VirtualOutlineList({ items, renderItem }: { items: SidebarOutlineItem[]; renderItem: (item: SidebarOutlineItem) => ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 28,
    getItemKey: index => items[index].id,
    overscan: 8,
  })
  return <div ref={scrollRef} className="h-full overflow-y-auto" data-testid="virtual-outline">
    <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
      {virtualizer.getVirtualItems().map(row => <div key={row.key} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: row.size, transform: `translateY(${row.start}px)` }}>
        {renderItem(items[row.index])}
      </div>)}
    </div>
  </div>
}
