import { useState, useEffect, useCallback } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  SettingsPage, getSetting, setSetting,
  Button, Label, Separator,
} from '@linch-tech/desktop-core'
import { open } from '@tauri-apps/plugin-dialog'
import { FileText, Upload, Check, Trash2 } from 'lucide-react'

const BUILTIN_TEMPLATES = [
  { id: 'default', name: '默认模板', desc: '1.5倍行距，宋体正文，黑体标题，A4 纸张' },
] as const

type TemplateId = typeof BUILTIN_TEMPLATES[number]['id'] | 'custom'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open: isOpen, onOpenChange }: Props) {
  const [tab, setTab] = useState<'general' | 'template'>('general')
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>('default')
  const [customTemplatePath, setCustomTemplatePath] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      getSetting<string>('docx_template').then(v => {
        if (v) setSelectedTemplate(v as TemplateId)
      })
      getSetting<string>('docx_template_custom_path').then(v => {
        if (v) setCustomTemplatePath(v)
      })
    }
  }, [isOpen])

  const handleSelectTemplate = useCallback(async (id: TemplateId) => {
    setSelectedTemplate(id)
    await setSetting('docx_template', id)
  }, [])

  const handleUploadCustom = useCallback(async () => {
    const filePath = await open({
      filters: [{ name: 'Word Template', extensions: ['docx'] }],
    })
    if (filePath) {
      const path = filePath as string
      const name = path.split('/').pop() || path
      setCustomTemplatePath(path)
      setSelectedTemplate('custom')
      await setSetting('docx_template', 'custom')
      await setSetting('docx_template_custom_path', path)
      await setSetting('docx_template_custom_name', name)
    }
  }, [])

  const handleClearCustom = useCallback(async () => {
    setCustomTemplatePath(null)
    setSelectedTemplate('default')
    await setSetting('docx_template', 'default')
    await setSetting('docx_template_custom_path', '')
    await setSetting('docx_template_custom_name', '')
  }, [])

  const tabs = [
    { id: 'general' as const, label: '通用' },
    { id: 'template' as const, label: '文档模板' },
  ]

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[80vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle>设置</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-0 px-5 border-b border-border">
          {tabs.map(t => (
            <button
              key={t.id}
              className={`px-3 py-2 text-xs border-b-2 transition-colors bg-transparent cursor-pointer ${
                tab === t.id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: 'calc(80vh - 120px)' }}>
          {tab === 'general' && (
            <div className="px-1">
              <SettingsPage />
            </div>
          )}

          {tab === 'template' && (
            <div className="space-y-4 p-5">
              <div>
                <Label className="text-xs text-muted-foreground">
                  导出 Word 文档时使用的样式模板（reference.docx）。模板控制字体、页边距、页眉页脚等样式。
                </Label>
              </div>

              <div className="space-y-2">
                {BUILTIN_TEMPLATES.map(t => (
                  <div
                    key={t.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedTemplate === t.id
                        ? 'border-foreground/30 bg-accent'
                        : 'border-border hover:bg-accent/50'
                    }`}
                    onClick={() => handleSelectTemplate(t.id)}
                  >
                    <FileText size={16} className="shrink-0 mt-0.5 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{t.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{t.desc}</div>
                    </div>
                    {selectedTemplate === t.id && (
                      <Check size={14} className="shrink-0 mt-0.5 text-foreground" />
                    )}
                  </div>
                ))}
              </div>

              <Separator />

              <div>
                <Label className="text-xs font-medium">自定义模板</Label>
                <p className="text-xs text-muted-foreground mt-1 mb-3">
                  上传你自己的 reference.docx。在 Word 中设置好样式（字体、行距、页眉页脚）后保存即可作为模板。
                </p>

                {customTemplatePath ? (
                  <div
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedTemplate === 'custom'
                        ? 'border-foreground/30 bg-accent'
                        : 'border-border hover:bg-accent/50'
                    }`}
                    onClick={() => handleSelectTemplate('custom')}
                  >
                    <FileText size={16} className="shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">自定义模板</div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">{customTemplatePath}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {selectedTemplate === 'custom' && <Check size={14} />}
                      <button
                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive bg-transparent border-none cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); handleClearCustom() }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={handleUploadCustom}>
                    <Upload size={13} />
                    选择模板文件
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
