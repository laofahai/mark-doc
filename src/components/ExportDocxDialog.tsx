import { useState, useEffect, useCallback } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Label,
} from '@linch-tech/desktop-core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { useTranslation } from 'react-i18next'
import { FileText, Check, Upload } from 'lucide-react'

/** 缩短路径显示：保留首段 + 最后一个目录 + 文件名，中间用 … 代替 */
function shortenPath(p: string, maxLen = 45): string {
  if (p.length <= maxLen) return p
  const sep = p.includes('\\') ? '\\' : '/'
  const parts = p.split(sep)
  const fileName = parts.pop() || ''
  if (parts.length <= 2) return p
  const first = parts[0] || ''
  const second = parts[1] || ''
  const lastDir = parts.pop() || ''
  const prefix = first + sep + second
  const shortened = `${prefix}${sep}…${sep}${lastDir}${sep}${fileName}`
  return shortened.length < p.length ? shortened : p
}

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

const LAST_EXPORT_DIR_KEY = 'mark-doc-last-export-dir'

export function ExportDocxDialog({ open: isOpen, onOpenChange, originalDocxPath, defaultFileName, currentFilePath, onExport }: Props) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<TemplateChoice>({ type: 'builtin', id: 'default' })
  const [customPath, setCustomPath] = useState<string | null>(null)
  const [outputPath, setOutputPath] = useState<string>('')

  useEffect(() => {
    if (isOpen) {
      if (originalDocxPath) {
        setSelected({ type: 'original' })
      } else {
        setSelected({ type: 'builtin', id: 'default' })
      }
      const v = localStorage.getItem('docx_template_custom_path')
      if (v) setCustomPath(v)

      // 计算默认保存路径
      const docxName = (defaultFileName || 'untitled').replace(/\.(md|docx)$/i, '') + '.docx'
      const lastDir = localStorage.getItem(LAST_EXPORT_DIR_KEY)
      const sourceDir = currentFilePath
        ? currentFilePath.substring(0, currentFilePath.lastIndexOf('/'))
        : undefined
      const dir = lastDir || sourceDir
      setOutputPath(dir ? `${dir}/${docxName}` : docxName)
    }
  }, [isOpen, originalDocxPath, defaultFileName, currentFilePath])

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

  const handlePickOutputPath = useCallback(async () => {
    const filePath = await save({
      filters: [{ name: 'Word', extensions: ['docx'] }],
      defaultPath: outputPath || undefined,
    })
    if (filePath) {
      let p = filePath as string
      if (!p.toLowerCase().endsWith('.docx')) p += '.docx'
      setOutputPath(p)
      // 记住目录
      const dir = p.substring(0, p.lastIndexOf('/'))
      if (dir) localStorage.setItem(LAST_EXPORT_DIR_KEY, dir)
    }
  }, [outputPath])

  const handleExport = useCallback(async () => {
    if (!outputPath) return
    onOpenChange(false)
    onExport(selected, outputPath)
  }, [selected, outputPath, onExport, onOpenChange])

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

        {/* 保存位置 */}
        <div className="space-y-1.5 py-1">
          <Label className="text-xs text-muted-foreground">{t('export.saveTo')}</Label>
          <div
            className="flex items-center gap-2 p-2 rounded-lg border border-border text-xs cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={handlePickOutputPath}
          >
            <FileText size={14} className="shrink-0 text-muted-foreground" />
            <span className="truncate flex-1 text-foreground" title={outputPath}>{outputPath ? shortenPath(outputPath) : t('export.selectSavePath')}</span>
            <Upload size={12} className="shrink-0 text-muted-foreground" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={handleExport} disabled={!outputPath}>{t('common.export')}</Button>
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
