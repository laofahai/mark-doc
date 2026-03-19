# MarkDoc

**A desktop Markdown and Word document editor** built with Tauri v2, React, and Vditor.

![Version](https://img.shields.io/badge/version-0.1.2-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)

[Website](https://linch.tech/zh/products/mark-doc)

## Features

- **WYSIWYG Markdown editing** -- powered by Vditor with custom Lucide toolbar icons
- **Bidirectional DOCX conversion** -- seamless Markdown to Word and Word to Markdown via Pandoc
- **Template-based export** -- export DOCX with built-in template, original style, or custom reference.docx
- **Built-in Chinese document template** -- Heiti headings, Songti body text, 1.5x line spacing, A4 layout
- **Mermaid diagram export** -- diagrams are rendered to PNG images during DOCX export
- **Base64 image embedding** -- images from DOCX are embedded as base64 for seamless editing
- **Multi-tab editing** -- open multiple files with unsaved changes confirmation
- **File tree sidebar** -- browse files with real-time folder watching, drill-in/drill-out navigation
- **File association** -- register as handler for `.md` and `.docx` files on macOS/Windows
- **External change detection** -- prompt to reload when files are modified by other applications
- **i18n** -- Chinese and English UI, with Vditor editor language sync
- **Dark and light themes** -- switch appearance via settings
- **Keyboard shortcuts** -- Cmd+S save, Cmd+N new, Cmd+O open, Cmd+W close, Ctrl+Tab switch tabs
- **Zoom and layout** -- adjustable page width (normal/wide/full), Ctrl+scroll zoom, word count
- **Settings dialog** -- configure language, theme, and document export template

## Screenshots

<!-- Add screenshots here -->

## Tech Stack

| Layer       | Technology                                          |
|-------------|-----------------------------------------------------|
| Framework   | Tauri v2 (Rust backend)                             |
| Frontend    | React 19, TypeScript                                |
| Editor      | Vditor                                              |
| Styling     | Tailwind CSS 4                                      |
| Build       | Vite 7                                              |
| Conversion  | Pandoc (system dependency)                          |
| Platform    | @linch-tech/desktop-core                            |

## Prerequisites

- **Node.js** >= 18
- **pnpm** >= 8
- **Rust** >= 1.77
- **Pandoc** -- required for DOCX conversion. The app will guide you through installation if not detected.
  - macOS: `brew install pandoc`
  - Windows: `winget install -e --id JohnMacFarlane.Pandoc`
  - Linux: `sudo apt install pandoc`

## Getting Started

```bash
# Install dependencies
pnpm install

# Run in development mode (desktop app)
npx tauri dev

# Run frontend only
pnpm dev
```

## Building

```bash
# Build the Tauri desktop application
npx tauri build
```

Build artifacts:

- macOS: `src-tauri/target/release/bundle/macos/MarkDoc.app` and `.dmg`
- Windows/Linux: corresponding directories under `src-tauri/target/release/bundle/`

## Project Structure

```
mark-doc/
├── src/                        # Frontend source code
│   ├── components/             # React components
│   │   ├── Editor/             # Vditor editor integration
│   │   ├── Sidebar.tsx         # File tree with drill-in/out
│   │   ├── ExportDocxDialog.tsx
│   │   ├── CloseConfirmDialog.tsx
│   │   ├── SettingsDialog.tsx
│   │   └── PandocGuard.tsx     # Pandoc installation guard
│   ├── contexts/               # FileContext (tabs, file ops)
│   ├── locales/                # i18n resources (zh, en)
│   ├── pages/                  # EditorPage
│   └── services/               # File I/O, export preprocessing
├── src-tauri/                  # Tauri / Rust backend
│   ├── src/
│   │   ├── converter.rs        # Pandoc conversion, image embedding
│   │   └── lib.rs              # App entry, file association handling
│   ├── resources/
│   │   └── reference.docx      # Built-in document template
│   └── tauri.conf.json
└── package.json
```

## License

MIT License -- see [LICENSE](LICENSE) for details.

---

# MarkDoc

**桌面端 Markdown + Word 文档编辑器**，基于 Tauri v2、React 和 Vditor 构建。

[官网](https://linch.tech/zh/products/mark-doc)

## 功能特性

- **所见即所得 Markdown 编辑** -- 基于 Vditor，自定义 Lucide 工具栏图标
- **双向 DOCX 转换** -- 通过 Pandoc 实现 Markdown 与 Word 文档无缝互转
- **模板化导出** -- 导出 DOCX 时可选内置模板、保留原样式或自定义模板
- **中文正式文档模板** -- 内置模板：黑体标题、宋体正文、1.5 倍行距、A4 版面
- **Mermaid 图表导出** -- 导出 DOCX 时自动将 Mermaid 图表渲染为 PNG
- **Base64 图片内嵌** -- 导入 DOCX 时图片转为 base64 嵌入编辑器
- **多标签页编辑** -- 同时打开多个文件，关闭未保存文件时提示确认
- **文件树侧边栏** -- 实时目录监听，支持上钻/下钻导航
- **文件类型关联** -- 在 macOS/Windows 注册为 .md 和 .docx 的打开方式
- **外部修改检测** -- 其他应用修改文件后提示是否重新加载
- **国际化** -- 中文/英文界面，Vditor 编辑器语言同步切换
- **亮色/暗色主题** -- 在设置中切换界面外观
- **快捷键** -- Cmd+S 保存、Cmd+N 新建、Cmd+O 打开、Cmd+W 关闭、Ctrl+Tab 切换标签
- **缩放与排版** -- 页面宽度调节（标准/宽屏/全宽）、Ctrl+滚轮缩放、字数统计
- **设置对话框** -- 配置语言、主题和文档导出模板

## 截图

<!-- 在此添加截图 -->

## 技术栈

| 层级     | 技术                                                 |
|----------|------------------------------------------------------|
| 框架     | Tauri v2（Rust 后端）                                |
| 前端     | React 19、TypeScript                                 |
| 编辑器   | Vditor                                               |
| 样式     | Tailwind CSS 4                                       |
| 构建     | Vite 7                                               |
| 文档转换 | Pandoc（系统依赖）                                   |
| 基座     | @linch-tech/desktop-core                             |

## 环境要求

- **Node.js** >= 18
- **pnpm** >= 8
- **Rust** >= 1.77
- **Pandoc** -- DOCX 转换必要依赖，未检测到时应用会引导安装
  - macOS：`brew install pandoc`
  - Windows：`winget install -e --id JohnMacFarlane.Pandoc`
  - Linux：`sudo apt install pandoc`

## 快速开始

```bash
# 安装依赖
pnpm install

# 以开发模式运行桌面应用
npx tauri dev

# 仅运行前端
pnpm dev
```

## 构建

```bash
# 构建 Tauri 桌面应用
npx tauri build
```

构建产物：

- macOS：`src-tauri/target/release/bundle/macos/MarkDoc.app` 和 `.dmg`
- Windows/Linux：`src-tauri/target/release/bundle/` 下对应目录

## 项目结构

```
mark-doc/
├── src/                        # 前端源代码
│   ├── components/             # React 组件
│   │   ├── Editor/             # Vditor 编辑器集成
│   │   ├── Sidebar.tsx         # 文件树（上钻/下钻）
│   │   ├── ExportDocxDialog.tsx
│   │   ├── CloseConfirmDialog.tsx
│   │   ├── SettingsDialog.tsx
│   │   └── PandocGuard.tsx     # Pandoc 安装引导
│   ├── contexts/               # FileContext（标签页、文件操作）
│   ├── locales/                # 国际化资源（zh、en）
│   ├── pages/                  # EditorPage
│   └── services/               # 文件 I/O、导出预处理
├── src-tauri/                  # Tauri / Rust 后端
│   ├── src/
│   │   ├── converter.rs        # Pandoc 转换、图片内嵌
│   │   └── lib.rs              # 应用入口、文件关联处理
│   ├── resources/
│   │   └── reference.docx      # 内置文档模板
│   └── tauri.conf.json
└── package.json
```

## 许可证

MIT License -- 详见 [LICENSE](LICENSE) 文件。
