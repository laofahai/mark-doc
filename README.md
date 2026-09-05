# MarkDoc

`.mdoc`-first desktop document editing for Markdown, images, and Word handoff.

[Website](https://linch.tech/zh/products/mark-doc) | [中文](README.zh-CN.md)

![License](https://img.shields.io/badge/license-MIT-green.svg)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)

MarkDoc's main file format is `.mdoc`. A `.mdoc` file is a portable document
package: clean Markdown stays at the center, while images, Word export
templates, and presentation resources travel with it in the same file.

Plain Markdown still works when a document is only text. Word import/export is
there for DOCX handoff, not as the product's storage model.

## What It Does

- Edit `.mdoc` documents backed by clean Markdown.
- Keep text, images, templates, and presentation resources in one file.
- Edit Markdown in a WYSIWYG desktop editor.
- Open `.md`, `.markdown`, `.txt`, `.mdoc`, `.docx`, and `.doc` files.
- Keep plain text documents as normal Markdown or text files.
- Save resource-heavy documents as one `.mdoc` file instead of leaving loose
  asset folders beside Markdown.
- Import Word documents into editable Markdown.
- Export the current document to DOCX.
- Use a built-in Word style template or your own `reference.docx`.
- Set A4/Letter page layout, portrait/landscape orientation, and print the
  current document from the desktop editor.
- Work with tabs, a file sidebar, a document outline, light/dark themes, and
  Chinese/English UI.
- Check for app updates from Settings in desktop builds.

## Basic Use

Install the desktop build for your system from
[GitHub Releases](https://github.com/laofahai/mark-doc/releases), then:

1. Open an existing document or create a new one.
2. Write in the editor. The toolbar formats Markdown without forcing you into
   raw syntax.
3. Save as `.mdoc` for normal MarkDoc work, especially when the document has
   images, imported assets, templates, or presentation resources.
4. Save as plain Markdown only when the document is text-only and you explicitly
   want a normal `.md` file.
5. Export DOCX when the file needs to be reviewed or delivered in Word.

## Which File Type Should I Use?

| Format | Use It For | Notes |
| --- | --- | --- |
| `.md`, `.markdown` | Text-first Markdown documents | Best when images and templates are not part of the file. |
| `.txt` | Plain text notes | Opens as editable text. |
| `.mdoc` | Markdown plus bundled images/templates/resources | A single portable package for richer documents. |
| `.docx`, `.doc` | Word documents you need to import | Converted through Pandoc before editing. |

## What Is `.mdoc`?

A `.mdoc` file is a ZIP package, not a normal `.md` file. It contains a
`manifest.json`, a Markdown entry file, and optional assets.

MarkDoc writes these stable package paths:

- `manifest.json`
- `document.md`
- `README.md`
- `assets/`
- `presentation/`

External tools and AI agents can read `.mdoc` without installing MarkDoc:

1. Unzip the file.
2. Validate `manifest.json`.
3. Read `manifest.entry` as the canonical Markdown source.
4. Resolve images and other resources relative to the package root.

The package `README.md` is only a hint for humans and AI tools. The manifest is
the source of truth.

Page layout lives in `manifest.presentation.page`, not in Markdown text. Older
tools can ignore it and still read the canonical Markdown entry.

Full format spec: [docs/spec/markdoc-package-v1.md](docs/spec/markdoc-package-v1.md)

## Word Conversion

DOCX and `.doc` import/export require Pandoc.

MarkDoc converts Word files into Markdown workspaces and extracts referenced
images as local assets. Export creates a new DOCX from the current Markdown
document.

MarkDoc is not a full Word layout engine. Complex Word formatting, embedded
objects, and exact visual layout may not round-trip perfectly.

## Requirements

- Node.js 20.19+ if running from source.
- `pnpm`; this repository pins `pnpm@10.32.1`.
- Rust stable toolchain if running the desktop app from source.
- Pandoc for Word import/export.

Pandoc examples:

```bash
brew install pandoc
winget install -e --id JohnMacFarlane.Pandoc
sudo apt install pandoc
```

## Run From Source

```bash
pnpm install
pnpm tauri:dev
```

Renderer-only development:

```bash
pnpm dev
```

Checks:

```bash
pnpm test
pnpm run lint
pnpm run build:check
```

Tauri/Rust tests:

```bash
cd src-tauri
cargo test
```

## License

MIT License. See [LICENSE](LICENSE).
