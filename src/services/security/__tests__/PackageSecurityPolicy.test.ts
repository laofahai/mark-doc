import { describe, expect, it } from 'vitest'
import { PackageSecurityPolicy } from '../PackageSecurityPolicy'

describe('PackageSecurityPolicy', () => {
  it('denies remote resources by default', () => {
    const policy = PackageSecurityPolicy.default()
    expect(policy.canLoadRemote('https://example.com/image.png', 'image')).toBe(false)
  })

  it('allows resource type trust without allowing every type', () => {
    const policy = PackageSecurityPolicy.default().allowResourceType('image')
    expect(policy.canLoadRemote('https://example.com/image.png', 'image')).toBe(true)
    expect(policy.canLoadRemote('https://example.com/style.css', 'style')).toBe(false)
  })

  it('allows domain exceptions', () => {
    const policy = PackageSecurityPolicy.default().allowDomain('images.example.com')
    expect(policy.canLoadRemote('https://images.example.com/a.png', 'image')).toBe(true)
    expect(policy.canLoadRemote('https://other.example.com/a.png', 'image')).toBe(false)
  })
})
