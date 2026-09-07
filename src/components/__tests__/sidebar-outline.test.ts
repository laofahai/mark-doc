import { describe, expect, it } from 'vitest'
import { getSidebarOutline, visibleSidebarOutline } from '../sidebar-outline'

describe('visible outline', () => {
  it('hides collapsed descendants but retains siblings and their collapse state', () => {
    const items = getSidebarOutline('# A\n## B\n### C\n# D\n## E\n# F')
    const visible = visibleSidebarOutline(items, new Set([items[0].id, items[1].id, items[3].id]))
    expect(visible.map(item => item.text)).toEqual(['A', 'D', 'F'])
  })
  it('handles many same-level headings without repeatedly scanning preceding items', () => {
    const items = getSidebarOutline('## Heading\n'.repeat(20_000))
    expect(visibleSidebarOutline(items, new Set())).toHaveLength(20_000)
  })
})
