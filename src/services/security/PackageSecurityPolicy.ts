type RemoteResourceType = 'image' | 'style' | 'font' | 'script' | 'other'

export class PackageSecurityPolicy {
  private constructor(
    private documentTrusted: boolean,
    private trustedTypes: Set<RemoteResourceType>,
    private trustedDomains: Set<string>,
  ) {}

  static default() {
    return new PackageSecurityPolicy(false, new Set(), new Set())
  }

  trustDocument() {
    return new PackageSecurityPolicy(true, new Set(this.trustedTypes), new Set(this.trustedDomains))
  }

  allowResourceType(type: RemoteResourceType) {
    return new PackageSecurityPolicy(this.documentTrusted, new Set([...this.trustedTypes, type]), new Set(this.trustedDomains))
  }

  allowDomain(domain: string) {
    return new PackageSecurityPolicy(this.documentTrusted, new Set(this.trustedTypes), new Set([...this.trustedDomains, domain]))
  }

  canLoadRemote(url: string, type: RemoteResourceType) {
    if (this.documentTrusted) return true
    const host = safeHost(url)
    if (!host) return false
    return this.trustedTypes.has(type) || this.trustedDomains.has(host)
  }
}

function safeHost(url: string) {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}
