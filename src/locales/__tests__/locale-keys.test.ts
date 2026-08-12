import { describe, expect, it } from 'vitest'
import zh from '../zh'
import en from '../en'

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object') return [prefix]
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key)
  )
}

describe('locale catalogs', () => {
  it('zh and en expose the same keys', () => {
    expect(flattenKeys(zh).sort()).toEqual(flattenKeys(en).sort())
  })

  it('contains document architecture key domains', () => {
    const topLevel = Object.keys(en).sort()
    expect(topLevel).toEqual(expect.arrayContaining([
      'document',
      'workspace',
      'assets',
      'presentation',
      'import',
      'export',
      'package',
      'security',
      'recovery',
      'errors',
    ]))
  })
})
