# MarkDoc

**A desktop Markdown and Word document editor** built with Tauri v2, React, and Vditor.

![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## Features

- **WYSIWYG Markdown editing** -- powered by Vditor with custom Lucide toolbar icons
- **Bidirectional DOCX conversion** -- seamless Markdown to Word and Word to Markdown via Pandoc
- **Chinese formal document template** -- built-in reference.docx with Heiti headings, Songti body text, and A4 page layout
- **Template-based export** -- export DOCX with options to keep original style, use the default template, or apply a custom template
- **Mermaid diagram rendering** -- diagrams are converted to PNG images during export
- **Multi-tab editing** -- open multiple files with close confirmation for unsaved changes
- **File tree sidebar** -- browse and manage files with real-time folder watching
- **Settings dialog** -- configure language, theme, and document template
- **Zoom and layout controls** -- adjustable page width and word count display
- **Dark and light themes** -- switch appearance to suit your preference

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
| Testing     | Vitest 4, Testing Library, Playwright               |

## Prerequisites

- **Node.js** >= 18
- **pnpm** >= 8
- **Rust** >= 1.77
- **Pandoc** -- required for DOCX conversion. Install it from [pandoc.org](https://pandoc.org/installing.html). The app will display installation guidance if Pandoc is not detected on your system.

## Getting Started

```bash
# Install dependencies
pnpm install

# Run in development mode (desktop)
pnpm tauri:dev

# Run frontend only
pnpm dev
```

## Building

```bash
# Build the Tauri desktop application
pnpm tauri:build
```

Build artifacts:

- macOS App: `src-tauri/target/release/bundle/macos/`
- DMG: `src-tauri/target/release/bundle/dmg/`
- Windows/Linux: corresponding bundle directories under `src-tauri/target/release/bundle/`

## Development

```bash
# Lint
pnpm lint

# Run unit tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run end-to-end tests
pnpm test:e2e
```

## Project Structure

```
mark-doc/
├── src/                        # Frontend source code
│   ├── components/             # React components
│   │   ├── Editor/             # Vditor editor integration
│   │   ├── Sidebar.tsx         # File tree sidebar
│   │   ├── ExportDocxDialog.tsx
│   │   ├── CloseConfirmDialog.tsx
│   │   ├── SettingsDialog.tsx
│   │   └── PandocGuard.tsx     # Pandoc availability check
│   ├── contexts/               # React contexts
│   ├── hooks/                  # Custom hooks
│   ├── pages/                  # Page components
│   ├── services/               # Service layer
│   └── test/                   # Test utilities
├── src-tauri/                  # Tauri / Rust backend
│   ├── src/
│   │   ├── converter.rs        # DOCX conversion logic
│   │   └── lib.rs / main.rs
│   └── tauri.conf.json
├── package.json
├── vite.config.ts
└── vitest.config.ts
```

## License

MIT License -- see [LICENSE](LICENSE) for details.

---

# MarkDoc

**桌面端 Markdown + Word 文档编辑器**，基于 Tauri v2、React 和 Vditor 构建。

## 功能特性

- **所见即所得的 Markdown 编辑** -- 基于 Vditor，配合自定义 Lucide 工具栏图标
- **双向 DOCX 转换** -- 通过 Pandoc 实现 Markdown 与 Word 文档的无缝互转
- **中文正式文档模板** -- 内置 reference.docx 模板（黑体标题、宋体正文、A4 版面）
- **模板化导出** -- 导出 DOCX 时可选择保持原始样式、使用默认模板或自定义模板
- **Mermaid 图表渲染** -- 导出时自动将图表转换为 PNG 图片
- **多标签页编辑** -- 同时打开多个文件，关闭未保存文件时提示确认
- **文件树侧边栏** -- 浏览和管理文件，支持实时目录监听
- **设置对话框** -- 配置语言、主题和文档模板
- **缩放与排版控制** -- 可调节页面宽度，显示字数统计
- **亮色/暗色主题** -- 根据偏好切换界面外观

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
| 测试     | Vitest 4、Testing Library、Playwright                |

## 环境要求

- **Node.js** >= 18
- **pnpm** >= 8
- **Rust** >= 1.77
- **Pandoc** -- DOCX 转换的必要依赖。请从 [pandoc.org](https://pandoc.org/installing.html) 安装。如果系统未检测到 Pandoc，应用会显示安装引导。

## 快速开始

```bash
# 安装依赖
pnpm install

# 以开发模式运行桌面应用
pnpm tauri:dev

# 仅运行前端
pnpm dev
```

## 构建

```bash
# 构建 Tauri 桌面应用
pnpm tauri:build
```

构建产物：

- macOS App：`src-tauri/target/release/bundle/macos/`
- DMG：`src-tauri/target/release/bundle/dmg/`
- Windows/Linux：`src-tauri/target/release/bundle/` 下对应目录

## 开发

```bash
# 代码检查
pnpm lint

# 运行单元测试
pnpm test

# 运行测试并生成覆盖率报告
pnpm test:coverage

# 运行端到端测试
pnpm test:e2e
```

## 项目结构

```
mark-doc/
├── src/                        # 前端源代码
│   ├── components/             # React 组件
│   │   ├── Editor/             # Vditor 编辑器集成
│   │   ├── Sidebar.tsx         # 文件树侧边栏
│   │   ├── ExportDocxDialog.tsx
│   │   ├── CloseConfirmDialog.tsx
│   │   ├── SettingsDialog.tsx
│   │   └── PandocGuard.tsx     # Pandoc 可用性检查
│   ├── contexts/               # React 上下文
│   ├── hooks/                  # 自定义 Hooks
│   ├── pages/                  # 页面组件
│   ├── services/               # 服务层
│   └── test/                   # 测试工具
├── src-tauri/                  # Tauri / Rust 后端
│   ├── src/
│   │   ├── converter.rs        # DOCX 转换逻辑
│   │   └── lib.rs / main.rs
│   └── tauri.conf.json
├── package.json
├── vite.config.ts
└── vitest.config.ts
```

## 许可证

MIT License -- 详见 [LICENSE](LICENSE) 文件。
