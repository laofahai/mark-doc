import { describe, expect, it } from 'vitest'
import { needsVirtualizedEditor } from '../document-size'

describe('large document routing', () => {
  it('keeps ordinary documents in the formatted editor', () => {
    expect(needsVirtualizedEditor('# Title\n\nBody')).toBe(false)
  })
  it('routes a huge single line without splitting it into a new array', () => {
    expect(needsVirtualizedEditor('x'.repeat(1_000_000))).toBe(true)
  })
  it('also routes many short lines that would create excessive DOM', () => {
    expect(needsVirtualizedEditor('x\n'.repeat(10_000))).toBe(true)
  })
})
