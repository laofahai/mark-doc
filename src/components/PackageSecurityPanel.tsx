import { useTranslation } from 'react-i18next'

interface Props {
  quarantined: string[]
  onTrustDocument: () => void
  onAllowImages: () => void
}

export function PackageSecurityPanel({ quarantined, onTrustDocument, onAllowImages }: Props) {
  const { t } = useTranslation()

  if (quarantined.length === 0) return null

  return (
    <div className="shrink-0 border-b border-border bg-background px-4 py-2 text-sm">
      <div className="font-medium text-foreground">{t('package.corruptedRecovery')}</div>
      <ul className="mt-2 text-xs text-muted-foreground">
        {quarantined.map(path => <li key={path}>{path}</li>)}
      </ul>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="cursor-pointer border border-border bg-transparent px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground" onClick={onTrustDocument}>{t('security.enableRemoteForDocument')}</button>
        <button className="cursor-pointer border border-border bg-transparent px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground" onClick={onAllowImages}>{t('security.enableRemoteImages')}</button>
      </div>
    </div>
  )
}
