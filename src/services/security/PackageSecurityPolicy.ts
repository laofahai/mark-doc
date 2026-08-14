export type RemoteResourceType = 'image' | 'style' | 'font' | 'script' | 'other'

export class PackageSecurityPolicy {
  private constructor(
    private documentTrusted: boolean,
    private trustedTypes: Set<RemoteResourceType>,
    private trustedDomains: Set<string>,
    private trustedUrls: Set<string>,
  ) {}

  static default() {
    return new PackageSecurityPolicy(false, new Set(), new Set(), new Set())
  }

  trustDocument() {
    return new PackageSecurityPolicy(
      true,
      new Set(this.trustedTypes),
      new Set(this.trustedDomains),
      new Set(this.trustedUrls),
    )
  }

  allowResourceType(type: RemoteResourceType) {
    return new PackageSecurityPolicy(
      this.documentTrusted,
      new Set([...this.trustedTypes, type]),
      new Set(this.trustedDomains),
      new Set(this.trustedUrls),
    )
  }

  allowDomain(domain: string) {
    return new PackageSecurityPolicy(
      this.documentTrusted,
      new Set(this.trustedTypes),
      new Set([...this.trustedDomains, normalizeDomain(domain)]),
      new Set(this.trustedUrls),
    )
  }

  allowUrl(url: string) {
    const normalized = safeRemoteUrl(url)
    if (!normalized) return this
    return new PackageSecurityPolicy(
      this.documentTrusted,
      new Set(this.trustedTypes),
      new Set(this.trustedDomains),
      new Set([...this.trustedUrls, normalized]),
    )
  }

  canLoadRemote(url: string, type: RemoteResourceType) {
    const normalized = safeRemoteUrl(url)
    if (!normalized) return false
    if (this.documentTrusted || this.trustedUrls.has(normalized)) return true
    const host = new URL(normalized).hostname
    return this.trustedTypes.has(type) || this.trustedDomains.has(host)
  }
}

function safeRemoteUrl(url: string) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.href
  } catch {
    return null
  }
}

function normalizeDomain(domain: string) {
  return domain.trim().toLowerCase().replace(/\.$/, '')
}
