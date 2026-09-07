# AGENTS.md

## Project Rules

- 默认使用中文回复用户，直接说明当前动作、验证结果和剩余风险。
- 本仓库使用 `pnpm`，不要改用 `npm`、`bun` 或生成其他 lockfile。
- 这是 Tauri 桌面应用。功能验收优先跑 `pnpm tauri:dev`；浏览器/Playwright 只能作为 renderer 辅助验证，涉及 Tauri API 时必须 mock 或跑真实桌面。
- 查询保存、打开、粘贴、资源路径问题时，先看 `src/services/debug-log.ts` 输出、Tauri stdout、浏览器 console 和 `src-tauri/capabilities/default.json` 权限，不要只看静态代码猜。
- `.mdoc` 是文档包主方向；资源、临时 workspace、导入导出逻辑应走 `src/services/document/*` 和 `src/services/assets/*`，不要把文件生命周期逻辑塞回编辑器组件。
- Tiptap/ProseMirror 负责排版编辑，CodeMirror 负责大文件源码编辑；两者统一通过 DocumentEditorAdapter 接入。打开、保存、导出、最近文件、页面设置等文档命令属于 Shell/Header 或 document command 层。
- 新增或修改用户可见文案时，同步 `src/locales/zh.ts` 和 `src/locales/en.ts`。
- 手工修改代码用 `apply_patch`。不要提交 `dist/`、`coverage/`、`target/`、运行日志、缓存、会话文件或用户本地文档。

## Verification

- 前端单测：`pnpm test`
- 浏览器渲染回归：`pnpm test:e2e`；仅覆盖 renderer，不能代替原生剪贴板、文件对话框及系统打印验收。
- 静态检查：`pnpm run lint`
- 类型和构建：`pnpm run build:check`
- Rust/Tauri 单测：`cargo test` in `src-tauri`
- 补丁空白检查：`git diff --check`
