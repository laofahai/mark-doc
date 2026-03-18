import { useState, useEffect, useCallback } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Label, getSetting,
} from '@linch-tech/desktop-core'
import { open } from '@tauri-apps/plugin-dialog'
import { FileText, Check, Upload } from 'lucide-react'

export type TemplateChoice =
  | { type: 'builtin'; id: string }
  | { type: 'original' }
  | { type: 'custom'; path: string }

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 原 docx 文件路径（打开的是 docx 时有值） */
  originalDocxPath?: string
  onExport: (template: TemplateChoice) => void
}

export function ExportDocxDialog({ open: isOpen, onOpenChange, originalDocxPath, onExport }: Props) {
  const [selected, setSelected] = useState<TemplateChoice>({ type: 'builtin', id: 'default' })
  const [customPath, setCustomPath] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      // 默认选原文件样式（如果有）
      if (originalDocxPath) {
        setSelected({ type: 'original' })
      } else {
        setSelected({ type: 'builtin', id: 'default' })
      }
      // 加载自定义模板路径
      getSetting<string>('docx_template_custom_path').then(v => {
        if (v) setCustomPath(v)
      })
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
          <DialogTitle>导出 Word 文档</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label className="text-xs text-muted-foreground">选择文档样式模板</Label>

          {/* 原文件样式（仅打开 docx 时显示） */}
          {originalDocxPath && (
            <TemplateOption
              selected={isSelected({ type: 'original' })}
              onClick={() => setSelected({ type: 'original' })}
              title="保留原文件样式"
              desc="使用打开的 Word 文件自身的样式"
            />
          )}

          {/* 内置默认模板 */}
          <TemplateOption
            selected={isSelected({ type: 'builtin', id: 'default' })}
            onClick={() => setSelected({ type: 'builtin', id: 'default' })}
            title="默认模板"
            desc="宋体正文、黑体标题、A4 纸张、1.5 倍行距"
          />

          {/* 自定义模板 */}
          {customPath ? (
            <TemplateOption
              selected={selected.type === 'custom'}
              onClick={() => setSelected({ type: 'custom', path: customPath })}
              title="自定义模板"
              desc={customPath.split('/').pop() || customPath}
            />
          ) : null}

          {/* 选择其他模板文件 */}
          <button
            className="w-full flex items-center gap-2 p-2.5 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors bg-transparent cursor-pointer"
            onClick={handlePickCustom}
          >
            <Upload size={14} />
            选择其他模板文件...
          </button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={() => { onExport(selected); onOpenChange(false) }}>导出</Button>
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
