# MarkDoc

A desktop document editor built around Markdown. Keep your writing, images, and layout together in one `.mdoc` file.

**English** | [简体中文](README.zh-CN.md) | [Releases](https://github.com/laofahai/mark-doc/releases)

Write a project plan, an illustrated guide, meeting notes, or a report. Edit
directly on the page, organize sections with the outline, and share the finished
document as a single file. Export to Word when that is what your team needs.

MarkDoc's main file format is `.mdoc`. It brings Markdown and its resources
together without hiding the source in a proprietary document database.
Standard `.md` files remain supported: use a package when you need one, not
because the editor requires it.

## One Document, Everything Together

A Markdown file is easy to read and work with. Images usually live elsewhere.
Move the file, send it to a colleague, or reorganize folders, and those links
can break.

With `.mdoc`, the text, images, and document presentation settings travel
together. Open it, edit it, save it, send it. No separate asset folder to collect.

The package is a ZIP file containing Markdown and a manifest. Other tools and
AI agents can extract it and read the source without installing MarkDoc.

## Write, Organize, Deliver

- **Write visually.** Format headings, lists, links, tables, and code without
  switching away from your document. Paste images alongside the text.
- **Keep your place.** Navigate a collapsible outline, browse the current
  folder, and work across multiple document tabs.
- **Shape the page.** Adjust table column widths, text colors, and highlights.
  Choose A4 or Letter, portrait or landscape, then print.
- **Stay with Markdown.** Keep ordinary documents as `.md`. Use the virtualized
  source editor for large files.
- **Work with Word users.** Import DOCX and export a Word copy with a built-in
  or custom document template.
- **Make yourself comfortable.** Light and dark themes, with English and
  Chinese interface languages.

## A Simple Workflow

1. Create a document or open an existing Markdown or DOCX file.
2. Write, add images, and use the outline to move between sections.
3. Press **Cmd+S** on macOS or **Ctrl+S** on Windows/Linux. Save as `.mdoc` when
   you want the document and its resources in one file, or keep standard Markdown.
4. Share the `.mdoc`, export DOCX, or print the document.

| Format | Purpose |
| --- | --- |
| `.mdoc` | A portable document with Markdown, images, and presentation resources. |
| `.md`, `.markdown` | Standard Markdown for use across editors and tools. |
| `.txt` | Plain text notes. |
| `.docx` | Word import and export. |

DOCX conversion uses Pandoc. MarkDoc converts document content rather than
reproducing every feature of Word; retain the original when exact Word layout
matters. Convert older binary `.doc` files to `.docx` if direct import fails.

## Open by Design

Inside an `.mdoc` package, `manifest.json` identifies the Markdown entry and
resources. The included `README.md` explains how to read the document. Text
remains accessible to scripts, other applications, and AI tools.

Custom-width tables use HTML within Markdown to preserve their dimensions.
Page settings belong to the package manifest rather than the document text.

[Read the `.mdoc` format specification](docs/spec/markdoc-package-v1.md).

## Run From Source

Use Node.js 24, the pnpm version pinned in `package.json`, Rust stable, and the
Tauri desktop prerequisites for your operating system. Word conversion also
requires Pandoc.

```bash
git clone https://github.com/laofahai/mark-doc.git
cd mark-doc
pnpm install
pnpm tauri:dev
```

This starts the desktop app, not a browser-only editor.

## License

[MIT](LICENSE).
