import { useTranslation } from 'react-i18next'
import type { RecoveryState } from '../services/document/recovery-service'

interface Props {
  state: RecoveryState
  onRetry: () => void
  onSaveAs: () => void
  onRestore: () => void
  onDiscard: () => void
}

export function RecoveryPanel({ state, onRetry, onSaveAs, onRestore, onDiscard }: Props) {
  const { t } = useTranslation()

  return (
    <div className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm">
      <div className="text-foreground">{t('workspace.recoveryAvailable')}</div>
      <div className="text-xs text-muted-foreground">{state.draftPath}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="cursor-pointer border-none bg-amber-500 px-2.5 py-1 text-xs text-white hover:bg-amber-600" onClick={onRetry}>{t('recovery.retrySave')}</button>
        <button className="cursor-pointer border border-border bg-transparent px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground" onClick={onSaveAs}>{t('recovery.saveAs')}</button>
        <button className="cursor-pointer border border-border bg-transparent px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground" onClick={onRestore}>{t('recovery.restoreDraft')}</button>
        <button className="cursor-pointer border border-border bg-transparent px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground" onClick={onDiscard}>{t('recovery.discardDraft')}</button>
      </div>
    </div>
  )
}
