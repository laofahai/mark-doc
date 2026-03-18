import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
} from '@linch-tech/desktop-core'

interface Props {
  open: boolean
  fileName: string
  onClose: () => void
  onDiscard: () => void
  onSave: () => void
}

export function CloseConfirmDialog({ open, fileName, onClose, onDiscard, onSave }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>未保存的更改</DialogTitle>
          <DialogDescription>
            "{fileName}" 有未保存的更改，是否保存？
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="outline" onClick={onDiscard}>不保存</Button>
          <Button onClick={onSave}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
