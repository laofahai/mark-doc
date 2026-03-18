import {
  Save, FilePlus, FolderOpen, Plus, AlignJustify,
  Clock, Trash2, X, FileText,
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
} from '@linch-tech/desktop-core'

export interface EditorToolbarActions {
  onNew: () => void
  onSave: () => void
  onExportMd: () => void
  onExportDocx: () => void
  onOpen: () => void
  onOpenFolder: () => void
  pageWidth: string
  onPageWidthChange: (w: string) => void
  recentFiles: { path: string; name: string }[]
  openFileFromPath: (path: string, name: string) => void
  removeRecentFile: (path: string) => void
  clearRecentFiles: () => void
}

export function EditorToolbarOverlay({ actions }: { actions: EditorToolbarActions }) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-0.5 pl-1">
        {/* 文件操作 */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button className="p-1 h-7 w-7 inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded cursor-pointer border-none bg-transparent">
                  <FilePlus size={15} />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">文件</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={actions.onNew}><Plus size={14} className="mr-2" /> 新建</DropdownMenuItem>
            <DropdownMenuItem onClick={actions.onOpen}><FilePlus size={14} className="mr-2" /> 打开文件...</DropdownMenuItem>
            <DropdownMenuItem onClick={actions.onOpenFolder}><FolderOpen size={14} className="mr-2" /> 打开文件夹...</DropdownMenuItem>
            {actions.recentFiles.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="flex items-center justify-between py-1">
                  <span className="flex items-center gap-1 text-[11px]"><Clock size={10} /> 最近</span>
                  <button className="p-0.5 rounded text-muted-foreground hover:text-destructive cursor-pointer border-none bg-transparent" onClick={(e) => { e.stopPropagation(); actions.clearRecentFiles() }}><Trash2 size={10} /></button>
                </DropdownMenuLabel>
                {actions.recentFiles.map(f => (
                  <DropdownMenuItem key={f.path} className="group/r text-[12px] py-1 pr-1" onClick={() => actions.openFileFromPath(f.path, f.name)}>
                    <FileText size={12} className="mr-1.5 shrink-0 text-muted-foreground" />
                    <span className="truncate flex-1">{f.name}</span>
                    <button className="p-0.5 rounded text-muted-foreground opacity-0 group-hover/r:opacity-100 hover:text-destructive cursor-pointer border-none bg-transparent shrink-0 ml-1" onClick={(e) => { e.stopPropagation(); actions.removeRecentFile(f.path) }}><X size={10} /></button>
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 保存 */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button className="p-1 h-7 w-7 inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded cursor-pointer border-none bg-transparent">
                  <Save size={15} />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">保存</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={actions.onSave}><Save size={14} className="mr-2" /> 保存 (⌘S)</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={actions.onExportMd}>导出 .md</DropdownMenuItem>
            <DropdownMenuItem onClick={actions.onExportDocx}>导出 .docx</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 页面宽度 */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button className="p-1 h-7 w-7 inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded cursor-pointer border-none bg-transparent">
                  <AlignJustify size={15} />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">页面宽度</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup value={actions.pageWidth} onValueChange={actions.onPageWidthChange}>
              <DropdownMenuRadioItem value="normal">标准宽度</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="wide">宽屏</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="full">全宽</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TooltipProvider>
  )
}
