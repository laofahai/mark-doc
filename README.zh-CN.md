# MarkDoc

以 `.mdoc` 为主格式的桌面文档编辑器。正文还是 Markdown，图片、模板和资源跟正文一起放进一个文件。

[官网](https://linch.tech/zh/products/mark-doc) | [English](README.md)

![License](https://img.shields.io/badge/license-MIT-green.svg)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)

MarkDoc 的主文件格式是 `.mdoc`。`.mdoc` 是可携带的文档包：Markdown 正文是中心，图片、Word 导出模板和演示资源跟它一起保存在同一个文件里。

纯文字文档仍然可以用普通 Markdown。Word 导入导出用于 DOCX 交换，不作为 MarkDoc 的主存储格式。

## 它能做什么

- 编辑以 Markdown 为正文源的 `.mdoc` 文档。
- 把正文、图片、模板和演示资源放进一个文件。
- 用所见即所得编辑器写 Markdown。
- 打开 `.md`、`.markdown`、`.txt`、`.mdoc`、`.docx` 和 `.doc`。
- 纯文本内容继续保存为普通 Markdown 或文本文件。
- 带图片、模板或其他资源的文档保存为一个 `.mdoc` 文件，不把资源散落在 Markdown 旁边。
- 把 Word 文档导入为可编辑 Markdown。
- 把当前文档导出为 DOCX。
- 导出 DOCX 时使用内置样式模板，或选择自己的 `reference.docx`。
- 设置 A4/Letter、横向/纵向页面版式，并从桌面编辑器直接打印当前文档。
- 支持多标签、文件侧边栏、文档大纲、亮暗主题和中英文界面。
- 桌面版可在设置里检查应用更新。

## 基本用法

先从 [GitHub Releases](https://github.com/laofahai/mark-doc/releases) 下载对应系统的桌面安装包，然后：

1. 打开已有文档，或新建文档。
2. 在编辑器里写内容。工具条会直接生成 Markdown 格式，不要求你手写语法。
3. 正常使用 MarkDoc 时保存为 `.mdoc`，尤其是文档里有图片、导入资源、模板或演示资源时。
4. 只有纯文字且明确想要普通 `.md` 文件时，再保存为 Markdown。
5. 需要给 Word 用户审阅或交付时，导出 DOCX。

## 该用哪种格式？

| 格式 | 适合场景 | 说明 |
| --- | --- | --- |
| `.md`、`.markdown` | 文字为主的 Markdown 文档 | 没有图片和模板资源时最简单。 |
| `.txt` | 普通文本记录 | 按文本打开和编辑。 |
| `.mdoc` | Markdown 加图片、模板、演示资源 | 一个文件带走所有资源，适合正式文档。 |
| `.docx`、`.doc` | 需要导入的 Word 文件 | 先通过 Pandoc 转成 Markdown 再编辑。 |

## `.mdoc` 是什么？

`.mdoc` 是 ZIP 文档包，不是普通 `.md` 文件。它包含 `manifest.json`、Markdown 正文入口和可选资源。

MarkDoc 写入的稳定路径：

- `manifest.json`
- `document.md`
- `README.md`
- `assets/`
- `presentation/`

外部工具和 AI Agent 不需要安装 MarkDoc 也能读取 `.mdoc`：

1. 把文件当作 ZIP 解压。
2. 校验 `manifest.json`。
3. 读取 `manifest.entry` 指向的 Markdown，作为正文来源。
4. 按文档包根目录解析图片和其他资源。

包内 `README.md` 只是给人和 AI 工具看的提示。真正的格式依据是 manifest。

页面版式保存在 `manifest.presentation.page`，不会写进 Markdown 正文。旧工具不理解这个字段时，可以忽略它并继续读取 Markdown 入口。

完整格式说明：[docs/spec/markdoc-package-v1.md](docs/spec/markdoc-package-v1.md)

## Word 转换边界

DOCX 和 `.doc` 导入导出依赖 Pandoc。

MarkDoc 会把 Word 文件转成 Markdown workspace，并提取其中引用的图片。导出时，会从当前 Markdown 文档生成新的 DOCX。

MarkDoc 不是完整的 Word 排版引擎。复杂格式、嵌入对象和精确版式不保证无损往返。

## 环境要求

- 从源码运行需要 Node.js 20.19+。
- 使用 `pnpm`；仓库锁定 `pnpm@10.32.1`。
- 从源码运行桌面端需要 Rust stable 工具链。
- Word 导入导出需要 Pandoc。

Pandoc 安装示例：

```bash
brew install pandoc
winget install -e --id JohnMacFarlane.Pandoc
sudo apt install pandoc
```

## 从源码运行

```bash
pnpm install
pnpm tauri:dev
```

只调试前端渲染层：

```bash
pnpm dev
```

检查命令：

```bash
pnpm test
pnpm run lint
pnpm run build:check
```

Tauri/Rust 测试：

```bash
cd src-tauri
cargo test
```

## 许可证

MIT License。详见 [LICENSE](LICENSE)。
