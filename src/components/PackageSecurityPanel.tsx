import { useTranslation } from 'react-i18next'
import type { RemoteResourceType } from '../services/security/PackageSecurityPolicy'

interface Props {
  quarantined: string[]
  recovered?: boolean
  onTrustDocument: () => void
  onAllowResourceType: (type: RemoteResourceType) => void
  onAllowDomain: (domain: string) => void
  onAllowUrl: (url: string) => void
}

const resourceTypeLabels: Record<RemoteResourceType, string> = {
  image: 'security.enableRemoteImages',
  style: 'security.enableRemoteStyles',
  font: 'security.enableRemoteFonts',
  script: 'security.enableRemoteScripts',
  other: 'security.enableOtherRemoteResources',
}

function remoteResourceType(url: string): RemoteResourceType {
  const pathname = new URL(url).pathname.toLowerCase()
  if (/\.(png|jpe?g|gif|webp|svg|avif)$/.test(pathname)) return 'image'
  if (/\.css$/.test(pathname)) return 'style'
  if (/\.(woff2?|ttf|otf)$/.test(pathname)) return 'font'
  if (/\.(m?js)$/.test(pathname)) return 'script'
  return 'other'
}

function remoteUrl(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed : null
  } catch {
    return null
  }
}

export function PackageSecurityPanel({ quarantined, recovered = false, onTrustDocument, onAllowResourceType, onAllowDomain, onAllowUrl }: Props) {
  const { t } = useTranslation()

  if (quarantined.length === 0) return null
  const remoteResources = quarantined.map(value => ({ value, parsed: remoteUrl(value) })).filter((resource): resource is { value: string; parsed: URL } => resource.parsed !== null)
  const resourceTypes = [...new Set(remoteResources.map(resource => remoteResourceType(resource.value)))]

  return (
    <div className="shrink-0 border-b border-border bg-background px-4 py-2 text-sm">
      <div className="font-medium text-foreground">{t(recovered ? 'package.corruptedRecovery' : 'package.quarantinedResources')}</div>
      <ul className="mt-2 text-xs text-muted-foreground">
        {quarantined.map(path => <li key={path}>{path}</li>)}
      </ul>
      {remoteResources.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button className="cursor-pointer border border-border bg-transparent px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground" onClick={onTrustDocument}>{t('security.enableRemoteForDocument')}</button>
          {resourceTypes.map(type => <button key={type} className="cursor-pointer border border-border bg-transparent px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => onAllowResourceType(type)}>{t(resourceTypeLabels[type])}</button>)}
          {remoteResources.map(({ value, parsed }) => (
            <span key={value} className="contents">
              <button className="cursor-pointer border border-border bg-transparent px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => onAllowDomain(parsed.hostname)}>{t('security.allowRemoteDomain', { domain: parsed.hostname })}</button>
              <button className="cursor-pointer border border-border bg-transparent px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => onAllowUrl(value)}>{t('security.allowRemoteUrl', { url: value })}</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
