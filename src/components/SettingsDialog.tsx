import { useState, useEffect, useCallback } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  ThemeSwitcher, LanguageSwitcher,
  Button, Label, Separator,
} from '@linch-tech/desktop-core'
import { useTranslation } from 'react-i18next'
import { FileText, Upload, Check, Trash2 } from 'lucide-react'
import { selectDocumentFile } from '../services/native-file'
import { SettingsUpdateSection } from './SettingsUpdateSection'
import { useDocument } from '../contexts/DocumentContext'

type TemplateId = 'default' | 'custom'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open: isOpen, onOpenChange }: Props) {
  const { t } = useTranslation()
  const documentContext = useDocument()
  const [tab, setTab] = useState<'general' | 'template'>('general')
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>('default')
  const [customTemplatePath, setCustomTemplatePath] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      const v = localStorage.getItem('docx_template')
      if (v) setSelectedTemplate(v as TemplateId)
      const cp = localStorage.getItem('docx_template_custom_path')
      if (cp) setCustomTemplatePath(cp)
    }
  }, [isOpen])

  const handleSelectTemplate = useCallback((id: TemplateId) => {
    setSelectedTemplate(id)
    localStorage.setItem('docx_template', id)
  }, [])

  const handleUploadCustom = useCallback(async () => {
    const filePath = await selectDocumentFile({
      filters: [{ name: t('fileFilters.wordTemplate'), extensions: ['docx'] }],
    })
    if (filePath) {
      const path = filePath as string
      const name = path.split('/').pop() || path
      setCustomTemplatePath(path)
      setSelectedTemplate('custom')
      localStorage.setItem('docx_template', 'custom')
      localStorage.setItem('docx_template_custom_path', path)
      localStorage.setItem('docx_template_custom_name', name)
    }
  }, [t])

  const handleClearCustom = useCallback(() => {
    setCustomTemplatePath(null)
    setSelectedTemplate('default')
    localStorage.setItem('docx_template', 'default')
    localStorage.removeItem('docx_template_custom_path')
    localStorage.removeItem('docx_template_custom_name')
  }, [])

  const tabs = [
    { id: 'general' as const, label: t('settings.tabGeneral') },
    { id: 'template' as const, label: t('settings.tabTemplate') },
  ]

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[80vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle>{t('settings.title')}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-0 px-5 border-b border-border">
          {tabs.map(tb => (
            <button
              key={tb.id}
              className={`px-3 py-2 text-xs border-b-2 transition-colors bg-transparent cursor-pointer ${
                tab === tb.id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setTab(tb.id)}
            >
              {tb.label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: 'calc(80vh - 120px)' }}>
          {tab === 'general' && (
            <div className="space-y-4 p-5">
              <div className="rounded-lg border p-4 bg-card flex items-center justify-between">
                <Label className="text-sm font-medium">{t('common.language')}</Label>
                <LanguageSwitcher variant="full" size="sm" />
              </div>
              <div className="rounded-lg border p-4 bg-card space-y-3">
                <Label className="text-sm font-medium">{t('common.theme')}</Label>
                <ThemeSwitcher variant="full" size="sm" />
              </div>
              <SettingsUpdateSection hasUnsavedDocuments={documentContext.tabs.some(tab => tab.isDirty)} />
              <section className="space-y-2 text-xs text-muted-foreground" aria-label={t('settings.about')}>
                <h3 className="text-sm font-medium text-foreground">{t('settings.about')}</h3>
                <a href="https://linch.tech" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">{t('settings.presentBy')}</a>
                <div className="flex flex-wrap gap-4">
                  <a href="https://linch.tech/zh/products/mark-doc" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">{t('settings.website')}</a>
                  <a href="https://github.com/laofahai/mark-doc" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">GitHub</a>
                </div>
              </section>
            </div>
          )}

          {tab === 'template' && (
            <div className="space-y-4 p-5">
              <div>
                <Label className="text-xs text-muted-foreground">
                  {t('settings.templateDesc')}
                </Label>
              </div>

              <div className="space-y-2">
                <div
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedTemplate === 'default'
                      ? 'border-foreground/30 bg-accent'
                      : 'border-border hover:bg-accent/50'
                  }`}
                  onClick={() => handleSelectTemplate('default')}
                >
                  <FileText size={16} className="shrink-0 mt-0.5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{t('settings.defaultTemplate')}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{t('settings.defaultTemplateDesc')}</div>
                  </div>
                  {selectedTemplate === 'default' && (
                    <Check size={14} className="shrink-0 mt-0.5 text-foreground" />
                  )}
                </div>
              </div>

              <Separator />

              <div>
                <Label className="text-xs font-medium">{t('settings.customTemplate')}</Label>
                <p className="text-xs text-muted-foreground mt-1 mb-3">
                  {t('settings.customTemplateDesc')}
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
                      <div className="text-sm font-medium">{t('settings.customTemplate')}</div>
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
                    {t('settings.selectTemplateFile')}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-5 py-3 border-t border-border">
          <Button onClick={() => onOpenChange(false)}>{t('common.done')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
