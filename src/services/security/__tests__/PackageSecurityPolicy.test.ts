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

  it('denies non-http remote schemes even for trusted documents', () => {
    const policy = PackageSecurityPolicy.default().trustDocument()
    expect(policy.canLoadRemote('javascript:alert(1)', 'script')).toBe(false)
    expect(policy.canLoadRemote('data:text/plain,hello', 'other')).toBe(false)
    expect(policy.canLoadRemote('file:///tmp/image.png', 'image')).toBe(false)
    expect(policy.canLoadRemote('https://example.com/image.png', 'image')).toBe(true)
  })

  it('allows only normalized exact URL exceptions', () => {
    const policy = PackageSecurityPolicy.default().allowUrl('HTTPS://EXAMPLE.COM:443/image.png#preview')
    expect(policy.canLoadRemote('https://example.com/image.png#preview', 'image')).toBe(true)
    expect(policy.canLoadRemote('https://example.com/image.png', 'image')).toBe(false)
    expect(policy.canLoadRemote('https://example.com/image.png?size=large', 'image')).toBe(false)
    expect(policy.canLoadRemote('data:text/plain,hello', 'other')).toBe(false)
  })
})
