import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
} from '@linch-tech/desktop-core'
import { useTranslation } from 'react-i18next'

interface Props {
  open: boolean
  fileName: string
  onClose: () => void
  onDiscard: () => void
  onSave: () => void
}

export function CloseConfirmDialog({ open, fileName, onClose, onDiscard, onSave }: Props) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('close.title')}</DialogTitle>
          <DialogDescription>
            {t('close.message', { fileName })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="outline" onClick={onDiscard}>{t('close.discard')}</Button>
          <Button onClick={onSave}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
