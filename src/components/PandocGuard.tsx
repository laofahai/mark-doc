import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Button } from '@linch-tech/desktop-core'
import { Loader2 } from 'lucide-react'

type Platform = 'macos' | 'windows' | 'linux' | 'unknown'

function getPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('mac')) return 'macos'
  if (ua.includes('win')) return 'windows'
  if (ua.includes('linux')) return 'linux'
  return 'unknown'
}

const INSTALL_TIPS: Record<Platform, string> = {
  macos: '请打开终端运行：brew install pandoc\n\n如果没有 Homebrew，请先访问 https://brew.sh 安装',
  windows: '请打开 PowerShell 运行：winget install -e --id JohnMacFarlane.Pandoc',
  linux: '请打开终端运行：sudo apt install pandoc（Ubuntu/Debian）\n或：sudo dnf install pandoc（Fedora）',
  unknown: '请访问 https://pandoc.org/installing.html 下载安装',
}

interface Props {
  children: ReactNode
}

/**
 * 包裹整个 app，启动时检测 pandoc。
 * - 有 pandoc → 正常渲染 children
 * - 没有 pandoc → 显示安装引导弹窗
 */
export function PandocGuard({ children }: Props) {
  const [status, setStatus] = useState<'checking' | 'ready' | 'missing'>('checking')
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)
  const platform = getPlatform()

  const checkPandoc = useCallback(async () => {
    setStatus('checking')
    try {
      const version = await invoke<string | null>('check_pandoc_available')
      setStatus(version ? 'ready' : 'missing')
    } catch {
      setStatus('missing')
    }
  }, [])

  useEffect(() => { checkPandoc() }, [checkPandoc])

  const handleAutoInstall = useCallback(async () => {
    setInstalling(true)
    setInstallError(null)
    try {
      const result = await invoke<{ success: boolean; error?: string }>('install_pandoc')
      if (result.success) {
        await checkPandoc()
      } else if (result.error === 'NO_BREW') {
        setInstallError('未检测到 Homebrew，请先安装 Homebrew 后重试，或手动安装 Pandoc')
      } else if (result.error === 'LINUX_MANUAL') {
        setInstallError('Linux 需要手动安装，请参考下方命令')
      } else {
        setInstallError(result.error || '安装失败')
      }
    } catch (e) {
      setInstallError(String(e))
    } finally {
      setInstalling(false)
    }
  }, [checkPandoc])

  // 检测中：不阻塞，直接渲染
  if (status === 'checking') return <>{children}</>
  if (status === 'ready') return <>{children}</>

  const canAutoInstall = platform === 'macos' || platform === 'windows'

  return (
    <>
      {children}
      <Dialog open={status === 'missing'} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-[440px]" onPointerDownOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>需要安装 Pandoc</DialogTitle>
            <DialogDescription>
              Pandoc 是文档转换引擎，用于 Word 文档的导入导出。请先安装后使用。
            </DialogDescription>
          </DialogHeader>

          <div className="py-3">
            <pre className="text-xs bg-muted p-3 rounded-md whitespace-pre-wrap select-all">
              {INSTALL_TIPS[platform]}
            </pre>

            {installError && (
              <p className="text-xs text-destructive mt-2">{installError}</p>
            )}
          </div>

          <DialogFooter className="gap-2">
            {canAutoInstall && (
              <Button onClick={handleAutoInstall} disabled={installing}>
                {installing && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {installing ? '安装中...' : '自动安装'}
              </Button>
            )}
            <Button variant="outline" onClick={checkPandoc}>
              重新检测
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
