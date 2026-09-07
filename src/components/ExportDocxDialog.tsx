import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Label,
} from '@linch-tech/desktop-core'
import { useTranslation } from 'react-i18next'
import { FileText, Check, Upload } from 'lucide-react'
import { selectDocumentFile, selectSavePath } from '../services/native-file'

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

export type TemplateChoice = import('../services/document/document-service').DocxTemplateSelection

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
  const [selected, setSelected] = useState<TemplateChoice>({ type: 'builtin', id: 'daily' })
  const [customPath, setCustomPath] = useState<string | null>(null)
  const [outputPath, setOutputPath] = useState<string>('')
  const [choosingOutput, setChoosingOutput] = useState(false)
  const [outputError, setOutputError] = useState(false)
  const outputDialogPending = useRef(false)

  useEffect(() => {
    if (isOpen) {
      setOutputError(false)
      const storedPath = localStorage.getItem('docx_template_custom_path')?.trim()
      const path = storedPath && /\.docx$/i.test(storedPath) && !storedPath.includes('\0') ? storedPath : null
      setCustomPath(path)
      setSelected(localStorage.getItem('docx_template') === 'custom' && path
        ? { type: 'custom', path }
        : { type: 'builtin', id: 'daily' })

      // 计算默认保存路径
      const docxName = (defaultFileName || 'untitled').replace(/\.(md|markdown|mdoc|txt|docx|doc)$/i, '') + '.docx'
      const lastDir = localStorage.getItem(LAST_EXPORT_DIR_KEY)
      const sourceDir = currentFilePath
        ? currentFilePath.substring(0, currentFilePath.lastIndexOf('/'))
        : undefined
      const dir = lastDir || sourceDir
      setOutputPath(dir ? `${dir}/${docxName}` : docxName)
    }
  }, [isOpen, originalDocxPath, defaultFileName, currentFilePath])

  const handlePickCustom = useCallback(async () => {
    const filePath = await selectDocumentFile({
      filters: [{ name: t('fileFilters.wordTemplate'), extensions: ['docx'] }],
    })
    if (filePath) {
      const path = filePath as string
      setCustomPath(path)
      setSelected({ type: 'custom', path })
    }
  }, [t])

  const chooseOutput = useCallback(async (exportAfterConfirmation: boolean) => {
    if (outputDialogPending.current) return
    outputDialogPending.current = true
    setChoosingOutput(true)
    setOutputError(false)
    try {
      let defaultPath = outputPath || undefined
      while (true) {
        const path = await selectSavePath({
          filters: [{ name: t('fileFilters.word'), extensions: ['docx'] }],
          defaultPath,
        })
        if (!path) return
        // Confirm the exact final path, including any extension we add.
        if (!path.toLowerCase().endsWith('.docx')) {
          defaultPath = `${path}.docx`
          continue
        }
        setOutputPath(path)
        const dir = path.substring(0, Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')))
        if (dir) localStorage.setItem(LAST_EXPORT_DIR_KEY, dir)
        if (exportAfterConfirmation) {
          onOpenChange(false)
          onExport(selected, path)
        }
        return
      }
    } catch {
      setOutputError(true)
    } finally {
      outputDialogPending.current = false
      setChoosingOutput(false)
    }
  }, [outputPath, selected, t, onExport, onOpenChange])

  const isSelected = (choice: TemplateChoice) => {
    if (selected.type !== choice.type) return false
    if (selected.type === 'builtin' && choice.type === 'builtin') return selected.id === choice.id
    if (selected.type === 'custom' && choice.type === 'custom') return selected.path === choice.path
    return true
  }

  return (
    <Dialog open={isOpen} onOpenChange={open => { if (!outputDialogPending.current) onOpenChange(open) }}>
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
            selected={isSelected({ type: 'builtin', id: 'daily' })}
            onClick={() => setSelected({ type: 'builtin', id: 'daily' })}
            title={t('export.dailyTemplate')}
            desc={t('export.dailyTemplateDesc')}
          />

          <TemplateOption
            selected={isSelected({ type: 'builtin', id: 'formal' })}
            onClick={() => setSelected({ type: 'builtin', id: 'formal' })}
            title={t('export.formalTemplate')}
            desc={t('export.formalTemplateDesc')}
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
            onClick={() => void chooseOutput(false)}
          >
            <FileText size={14} className="shrink-0 text-muted-foreground" />
            <span className="truncate flex-1 text-foreground" title={outputPath}>{outputPath ? shortenPath(outputPath) : t('export.selectSavePath')}</span>
            <Upload size={12} className="shrink-0 text-muted-foreground" />
          </div>
        </div>

        {outputError && <p role="alert" className="text-xs text-destructive">{t('errors.export.docxFailed')}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={choosingOutput}>{t('common.cancel')}</Button>
          <Button onClick={() => void chooseOutput(true)} disabled={!outputPath || choosingOutput}>{t('common.export')}</Button>
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
