import { describe, expect, it } from 'vitest'
import { err, isErr, isOk, ok } from '../errors'

describe('document errors', () => {
  it('creates ok results', () => {
    const result = ok({ id: 'doc-1' })
    expect(isOk(result)).toBe(true)
    expect(isErr(result)).toBe(false)
    if (result.ok) expect(result.value.id).toBe('doc-1')
  })

  it('creates typed document errors with stable keys', () => {
    const result = err('package.invalidManifest', {
      messageKey: 'errors.package.invalidManifest',
      params: { path: 'report.mdoc' },
    })
    expect(isErr(result)).toBe(true)
    if (!result.ok) {
      expect(result.error.code).toBe('package.invalidManifest')
      expect(result.error.messageKey).toBe('errors.package.invalidManifest')
      expect(result.error.params?.path).toBe('report.mdoc')
    }
  })
})
