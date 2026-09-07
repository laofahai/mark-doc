# MarkDoc

以 Markdown 为正文的桌面文档编辑器。文字、图片和版式，一起放进一个 `.mdoc` 文件。

[English](README.md) | **简体中文** | [版本与下载](https://github.com/laofahai/mark-doc/releases)

写项目方案、图文教程、会议纪要或工作报告，在页面里直接编辑，通过大纲整理章节，写完后用一个文件交付。对方使用 Word，就导出 DOCX。

MarkDoc 的主文件格式是 `.mdoc`，把 Markdown 和随文资源放在一起，不把正文藏进专有数据库。普通 `.md` 文件也能照常使用，需要打包时再打包，不强制换格式。

## 一份文档，完整带走

Markdown 正文易读、易处理，但图片通常放在另一个目录。移动文件、发给同事、重新整理文件夹时，图片链接就可能失效。

`.mdoc` 让正文、图片和文档版式一起保存。打开、编辑、保存、发送，不用另找图片文件夹。

它本质上是包含 Markdown 和清单的 ZIP 文件。其他工具和 AI 可以直接解压读取，不必安装 MarkDoc。

## 从写作到交付

- **直接编辑。** 标题、列表、链接、表格和代码，所见即所得。截图和图片直接粘贴到正文里。
- **整理长文档。** 用可折叠大纲定位章节，切换目录树浏览文件，多标签处理不同文档。
- **调整排版。** 拖动表格列宽，设置文字颜色与高亮，选择 A4 或 Letter、横向或纵向，再打印。
- **保留 Markdown。** 普通文档继续保存为 `.md`，大文件使用按可见区域渲染的源码编辑器。
- **与 Word 用户协作。** 导入 DOCX，使用内置或自定义文档模板导出 Word 文件。
- **按习惯使用。** 亮暗主题，中英文界面。

## 怎么用

1. 新建文档，或打开已有的 Markdown、DOCX 文件。
2. 写正文、添加图片，通过侧边栏大纲在章节间跳转。
3. macOS 按 **Cmd+S**，Windows/Linux 按 **Ctrl+S**。需要把正文和资源一起保存时选择 `.mdoc`，也可以继续使用普通 Markdown。
4. 发送 `.mdoc` 文档包，导出 DOCX，或直接打印。

| 格式 | 用途 |
| --- | --- |
| `.mdoc` | 随身携带的完整文档，包含 Markdown、图片和版式资源。 |
| `.md`、`.markdown` | 标准 Markdown，配合其他编辑器和工具使用。 |
| `.txt` | 纯文字记录。 |
| `.docx` | 与 Word 交换文档。 |

DOCX 转换依赖 Pandoc。MarkDoc 转换的是文档内容，不复刻 Word 的全部功能；需要保留精确 Word 版式时，请保留原件。旧版二进制 `.doc` 文件若无法直接导入，请先转换为 `.docx`。

## 文档始终可读

`.mdoc` 包内的 `manifest.json` 指向 Markdown 正文和资源，随附的 `README.md` 说明读取方式。正文仍可交给脚本、其他应用和 AI 工具处理。

自定义列宽的表格使用 Markdown 内的 HTML 保留尺寸；页面设置放在文档包清单中，不混入正文。

[查看 `.mdoc` 格式规范](docs/spec/markdoc-package-v1.md)。

## 从源码运行

准备 Node.js 24、`package.json` 指定版本的 pnpm、Rust stable，以及当前系统的 Tauri 桌面开发依赖。需要 Word 转换时再安装 Pandoc。

```bash
git clone https://github.com/laofahai/mark-doc.git
cd mark-doc
pnpm install
pnpm tauri:dev
```

这会启动桌面程序，不是仅在浏览器中运行的编辑器。

## 许可证

[MIT](LICENSE)。
