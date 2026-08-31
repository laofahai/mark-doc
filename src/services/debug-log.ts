import { invoke } from '@tauri-apps/api/core'

export function debugLog(message: string, details?: Record<string, unknown>) {
  const suffix = details ? ` ${JSON.stringify(details)}` : ''
  console.info(`[mark-doc debug] ${message}${suffix}`)
  void Promise.resolve(invoke('debug_log', { message: `${message}${suffix}` })).catch(() => {})
}
