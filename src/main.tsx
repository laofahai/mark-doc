import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// 生产环境禁用右键菜单、文本选中、F12
// Cmd+Shift+D 可打开开发者工具（隐藏入口）
if (import.meta.env.PROD) {
  document.addEventListener('contextmenu', (e) => {
    // 允许编辑器内的右键（vditor 需要）
    if (!(e.target as HTMLElement).closest('.vditor')) {
      e.preventDefault()
    }
  })
  document.addEventListener('keydown', (e) => {
    // 禁用 F12
    if (e.key === 'F12') e.preventDefault()
    // 禁用 Cmd+Shift+I (开发者工具)
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'I') e.preventDefault()
  })
  // 禁用非编辑器区域的选中
  document.addEventListener('selectstart', (e) => {
    if (!(e.target as HTMLElement).closest('.vditor')) {
      e.preventDefault()
    }
  })
}

// Cmd+Shift+D 打开开发者工具（开发/生产均可用）
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'D') {
    e.preventDefault()
    // @ts-ignore - Tauri internal API
    window.__TAURI_INTERNALS__?.invoke('plugin:webview|internal_toggle_devtools')
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
