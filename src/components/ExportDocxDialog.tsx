import { useState, useEffect, useCallback } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Label,
} from '@linch-tech/desktop-core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { useTranslation } from 'react-i18next'
import { FileText, Check, Upload } from 'lucide-react'

export type TemplateChoice =
  | { type: 'builtin'; id: string }
  | { type: 'original' }
  | { type: 'custom'; path: string }

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  originalDocxPath?: string
  defaultFileName?: string
  currentFilePath?: string
  onExport: (template: TemplateChoice, outputPath: string) => void
}

export function ExportDocxDialog({ open: isOpen, onOpenChange, originalDocxPath, defaultFileName, currentFilePath, onExport }: Props) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<TemplateChoice>({ type: 'builtin', id: 'default' })
  const [customPath, setCustomPath] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      if (originalDocxPath) {
        setSelected({ type: 'original' })
      } else {
        setSelected({ type: 'builtin', id: 'default' })
      }
      const v = localStorage.getItem('docx_template_custom_path')
      if (v) setCustomPath(v)
    }
  }, [isOpen, originalDocxPath])

  const handlePickCustom = useCallback(async () => {
    const filePath = await open({
      filters: [{ name: 'Word Template', extensions: ['docx'] }],
    })
    if (filePath) {
      const path = filePath as string
      setCustomPath(path)
      setSelected({ type: 'custom', path })
    }
  }, [])

  const handleExport = useCallback(async () => {
    // 先选保存位置，默认保存到原文件所在目录
    const docxName = (defaultFileName || 'untitled').replace(/\.(md|docx)$/i, '') + '.docx'
    const defaultDir = currentFilePath
      ? currentFilePath.substring(0, currentFilePath.lastIndexOf('/'))
      : undefined
    const defaultPath = defaultDir ? `${defaultDir}/${docxName}` : docxName
    const filePath = await save({
      filters: [{ name: 'Word', extensions: ['docx'] }],
      defaultPath,
    })
    if (!filePath) return
    let outputPath = filePath as string
    if (!outputPath.toLowerCase().endsWith('.docx')) {
      outputPath += '.docx'
    }
    onOpenChange(false)
    onExport(selected, outputPath)
  }, [selected, defaultFileName, currentFilePath, onExport, onOpenChange])

  const isSelected = (choice: TemplateChoice) => {
    if (selected.type !== choice.type) return false
    if (selected.type === 'builtin' && choice.type === 'builtin') return selected.id === choice.id
    if (selected.type === 'custom' && choice.type === 'custom') return selected.path === choice.path
    return true
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{t('export.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label className="text-xs text-muted-foreground">{t('export.selectTemplate')}</Label>

          {originalDocxPath && (
            <TemplateOption
              selected={isSelected({ type: 'original' })}
              onClick={() => setSelected({ type: 'original' })}
              title={t('export.keepOriginalStyle')}
              desc={t('export.keepOriginalStyleDesc')}
            />
          )}

          <TemplateOption
            selected={isSelected({ type: 'builtin', id: 'default' })}
            onClick={() => setSelected({ type: 'builtin', id: 'default' })}
            title={t('export.defaultTemplate')}
            desc={t('export.defaultTemplateDesc')}
          />

          {customPath ? (
            <TemplateOption
              selected={selected.type === 'custom'}
              onClick={() => setSelected({ type: 'custom', path: customPath })}
              title={t('export.customTemplate')}
              desc={customPath.split('/').pop() || customPath}
            />
          ) : null}

          <button
            className="w-full flex items-center gap-2 p-2.5 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors bg-transparent cursor-pointer"
            onClick={handlePickCustom}
          >
            <Upload size={14} />
            {t('export.selectOtherTemplate')}
          </button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={handleExport}>{t('common.export')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TemplateOption({ selected, onClick, title, desc }: {
  selected: boolean
  onClick: () => void
  title: string
  desc: string
}) {
  return (
    <div
      className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
        selected ? 'border-foreground/30 bg-accent' : 'border-border hover:bg-accent/50'
      }`}
      onClick={onClick}
    >
      <FileText size={15} className="shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground truncate">{desc}</div>
      </div>
      {selected && <Check size={14} className="shrink-0" />}
    </div>
  )
}
