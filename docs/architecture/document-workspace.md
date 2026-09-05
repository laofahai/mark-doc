# MarkDoc Document Workspace Architecture

## Product Position

MarkDoc is a modern document editor with Markdown as its canonical semantic
source.

The product goal is not to become a Pandoc GUI, a full Word clone, or a
proprietary document format. The goal is:

> Edit like a document editor, preserve meaning as clean Markdown, and keep the
> document readable by humans, Git, search, and AI without MarkDoc installed.

```text
DOCX and PDF are delivery formats; Markdown remains the canonical semantic source whenever possible.
```
Visual presentation is a replaceable rendering layer.

Internationalization is a core product requirement, not a UI polish task.
MarkDoc should work naturally for Chinese and English users, and the architecture
must not bake user-facing language into document, importer, exporter, package, or
error-handling code.

## Core Concept

`DocumentWorkspace` is MarkDoc's internal working representation for one
primary document.

It is not primarily a user-facing format name. It is an application boundary
that gives every opened document the same shape regardless of whether the user
opened `.md`, `.docx`, a folder bundle, or a `.mdoc` package.

Conceptually:

```text
DocumentWorkspace
├── document.md
├── assets/
├── presentation/
└── manifest / metadata
```

Physically it can be backed by different storage forms:

```text
Plain .md file
  The workspace can be virtual.
  The entry markdown is the opened file.
  Referenced assets live relative to that markdown file.

Directory bundle
  The workspace is a real folder.
  It contains document.md, assets/, presentation/, and optional manifest.

Imported DOCX
  The workspace is a real temporary or app-data folder.
  The DOCX is imported into document.md + assets/ + presentation/.

MarkDoc package
  The workspace is extracted from, then saved back to, a single-file .mdoc
  package.
```

So yes: most advanced cases use a directory while editing. For ordinary
Markdown, the directory does not have to be exposed or generated.

## MarkDoc Package

`.mdoc` is the user-visible MarkDoc document format for resource-backed and
imported documents.

Use `.mdoc` as the default save target when:

- a new document is saved from MarkDoc's document editor flow
- a plain Markdown document receives newly imported images or attachments
- a DOCX is imported and the user saves the editable canonical document
- a document needs bundled presentation resources such as `reference.docx`

Plain `.md` remains a first-class format. Existing Markdown projects must not be
silently converted. If MarkDoc detects local image or attachment references in
an existing `.md`, it should show a non-blocking suggestion to save as `.mdoc`
for portability; declining the suggestion keeps `Cmd+S` as an in-place `.md`
save.

`.mdoc` is a normal ZIP package identified by a strong manifest, not by the file
extension alone:

```json
{
  "format": "markdoc-package",
  "version": 1,
  "entry": "document.md",
  "schema": "https://raw.githubusercontent.com/laofahai/mark-doc/main/schemas/markdoc-package-v1.schema.json",
  "spec": "https://github.com/laofahai/mark-doc/blob/main/docs/spec/markdoc-package-v1.md"
}
```

The extension is a UX hint. The manifest is authoritative.

AI and external tools should be able to identify the package without MarkDoc
installed. The package therefore carries machine-readable discovery in
`manifest.json`, not only prose documentation:

- `format`: stable package identifier, currently `markdoc-package`
- `version`: format version, currently `1`
- `schema`: JSON Schema URL for validators and AI tools
- `spec`: short human-readable package specification URL
- optional packaged `README.md`: a hint for humans and AI explaining that the
  file is a ZIP, `manifest.json` is authoritative, `manifest.entry` names the
  canonical source, resource paths are relative, and remote resources are not
  trusted by default

`README.md` is never the protocol authority. Readers must validate
`manifest.json`; writers should include the README only as a convenience hint.

```text
Manifest metadata is authoritative. Packaged README text is explanatory only.
AI tools should discover `.mdoc` by unzipping the package, reading
manifest.json, following schema/spec metadata, and treating manifest.entry as
the canonical semantic source.
```

## One Document, Many Files

The first-class unit is one primary document, not a book/project system.

One document can contain many files:

```text
document.md
assets/image-001.png
assets/report-data.csv
assets/appendix.pdf
presentation/reference.docx
presentation/print.css
```

Those files are resources of the primary document. The canonical readable
content is the Markdown file named by `manifest.entry`; MarkDoc writes
`document.md` by default.

Multiple Markdown documents should be modeled as multiple workspaces or tabs.
MarkDoc should not make multi-document packages the core model until there is a
real product need for books, projects, or knowledge bases. If that becomes
necessary later, it should be introduced as `WorkspaceCollection`, not by
overloading `DocumentWorkspace`.

## Source Types

```ts
type DocumentSource =
  | PlainMarkdownSource
  | DirectoryBundleSource
  | PackageSource
  | ImportedDocxSource

interface PlainMarkdownSource {
  type: "markdown"
  path: string
}

interface DirectoryBundleSource {
  type: "directory"
  rootPath: string
  entryPath: string
}

interface PackageSource {
  type: "package"
  packagePath: string
  extractedWorkspacePath: string
}

interface ImportedDocxSource {
  type: "docx"
  originalPath: string
  workspacePath: string
}
```

DOCX must not become internal document state. Opening DOCX is an import
operation that produces a workspace.

## Document Model

```ts
interface DocumentModel {
  id: string
  source: DocumentSource
  workspace: DocumentWorkspace
  markdown: string
  metadata: DocumentMetadata
  assets: AssetRegistry
  presentation: PresentationConfig
  dirty: DocumentDirtyState
}

interface DocumentWorkspace {
  id: string
  rootPath?: string
  entryPath: string
  assetsPath?: string
  presentationPath?: string
  manifestPath?: string
  storage: WorkspaceStorage
}

type WorkspaceStorage =
  | { type: "virtual-markdown"; markdownPath: string }
  | { type: "directory"; rootPath: string }
  | { type: "temporary"; rootPath: string; recoveryKey: string }
```

For a plain `.md`, `rootPath` can be the file's parent directory and `entryPath`
can be the opened file path. MarkDoc should not create `manifest.json` or
`assets/` until the document actually needs extra resources.

## Metadata

Frontmatter describes the document:

```yaml
---
title: 2026 Operation Report
author: Ian
date: 2026-08-11
tags:
  - operation
  - report
---
```

Manifest describes the package/workspace structure:

```json
{
  "format": "markdoc-package",
  "version": 1,
  "entry": "document.md"
}
```

Do not duplicate title, author, tags, status, or other document semantics in the
manifest. That creates two sources of truth.

Document language can be expressed in frontmatter when it is part of the
document semantics:

```yaml
---
title: 2026 Operation Report
lang: zh-CN
---
```

This is different from the application UI language. UI language controls menus,
dialogs, errors, tooltips, and editor chrome. Document language describes the
document itself and can influence spellcheck, typography, export defaults, and
presentation profiles.

## Assets

Content assets belong to the document meaning:

```text
assets/
├── image-001.png
├── architecture.svg
├── appendix.pdf
└── data.csv
```

Markdown references must be relative:

```md
![Architecture](assets/architecture.svg)
```

Base64 is allowed only for clipboard/transient compatibility and migration.
It must not be the default persisted form.

Asset handling belongs in `AssetManager`, not in the editor, file context, or
Pandoc wrapper.

```ts
interface AssetManager {
  importFile(inputPath: string, options?: ImportAssetOptions): Promise<AssetRef>
  importBytes(bytes: Uint8Array, options: ImportBytesOptions): Promise<AssetRef>
  resolve(ref: string): Promise<ResolvedAsset>
  validateReferences(markdown: string): Promise<AssetValidationResult>
  rewriteReferences(markdown: string, rewrite: AssetRewrite): Promise<string>
  findOrphans(markdown: string): Promise<AssetRef[]>
}
```

Implementation rule: Markdown paths are still the primary registry.
`AssetRegistry` can start as a runtime helper and should not become a second
truth source.

## Presentation

Presentation resources affect rendering but not semantic meaning:

```text
presentation/
├── screen.css
├── print.css
├── reference.docx
└── fonts/
```

```ts
interface PresentationConfig {
  profile?: string
  screen?: PresentationResource
  print?: PresentationResource
  page?: DocumentPageLayout
  docx?: DocxPresentation
}

interface DocumentPageLayout {
  size: 'a4' | 'letter'
  orientation: 'portrait' | 'landscape'
  margins: {
    top: string
    right: string
    bottom: string
    left: string
  }
}

interface DocxPresentation {
  referenceDocx?: string
}
```

Deleting `presentation/` must not make the document semantically unreadable.
`page` is manifest metadata, not a resource file, so deleting `presentation/`
does not remove it from a valid `.mdoc` package. Plain Markdown files should not
gain page metadata unless the user explicitly saves them as `.mdoc`.

The built-in Chinese formal `reference.docx` should become a built-in
presentation profile, not special-case application logic.

Presentation profile names and descriptions must be localized through i18n keys.
The stored profile identifier must be stable and language-neutral:

```json
{
  "presentation": {
    "profile": "zh-formal-office"
  }
}
```

The UI can render that as `中文正式文档` or `Chinese Formal Document` depending
on the application language.

## Importers And Exporters

The editor should not know Pandoc command-line details.

```ts
interface DocumentImporter {
  canImport(source: ImportSource): boolean
  import(source: ImportSource): Promise<DocumentModel>
}

interface DocumentExporter<TOptions> {
  export(document: DocumentModel, options: TOptions): Promise<ExportResult>
}
```

Required importers:

```text
MarkdownImporter
DocxImporter
PackageImporter
```

Required exporters:

```text
MarkdownExporter
DocxExporter
PackageExporter
```

Pandoc is an implementation detail used by importers/exporters. It is not the
application architecture.

Importer/exporter errors must return stable error codes plus parameters, not
already-localized prose:

```ts
interface DocumentError {
  code: string
  messageKey: string
  params?: Record<string, string | number>
  cause?: unknown
}
```

The UI is responsible for translating `messageKey`. This keeps Rust commands,
frontend services, tests, and logs from depending on one display language.

## Editor Adapter

Vditor can remain the current editor implementation, but it must be behind an
adapter.

```ts
interface DocumentEditorAdapter {
  getMarkdown(): string
  setMarkdown(markdown: string): void
  focus(): void
  insertImage(asset: AssetRef): void
  insertAttachment(asset: AssetRef): void
}
```

The document domain must not depend on Vditor's internal DOM or APIs.

The editor adapter must accept locale configuration from the application shell:

```ts
interface EditorLocaleConfig {
  uiLanguage: "zh" | "en"
  editorLanguage: "zh_CN" | "en_US"
  documentLanguage?: string
}
```

Vditor language, toolbar labels, placeholder text, dialogs, and custom toolbar
extensions must all use the same i18n source.

## Save Strategy

Different source types save differently:

```text
Plain Markdown
  Save markdown to the original .md path.
  If it already references local assets, show a non-blocking .mdoc portability
  suggestion.
  If the user imports new assets, default Save As target becomes .mdoc.
  Do not silently force package conversion.

Directory bundle
  Save workspace files in place.

.mdoc Package
  Save workspace to a temporary package.
  Validate.
  Atomically replace original package.
  Preserve a recoverable draft or previous version where practical.

Imported DOCX
  Do not silently overwrite the original DOCX as canonical state.
  Save the editable canonical document as .mdoc by default, with Markdown folder
  export still available.
  Export DOCX explicitly.
```

This avoids treating a generated DOCX as the live source of truth.

Save safety priority:

```text
user content is not lost
> original file is not corrupted
> failure is hidden from the user
```

Save operations can fail because of disk, permission, cloud sync, antivirus, or
process interruption. MarkDoc must handle that reality by using atomic writes,
recovery drafts, clear failure states, and recovery UI. The product promise is
not "save can never fail"; it is "a save failure must not silently destroy user
content."

## Package Layout

The `.mdoc` package is the canonical single-file representation of a
resource-backed `DocumentWorkspace`. It is a core user-facing format, while the
workspace remains the internal editing representation.

Minimal package:

```text
report.mdoc
└── zip contents
    ├── document.md
    ├── manifest.json
    └── assets/
```

With presentation:

```text
report.mdoc
└── zip contents
    ├── document.md
    ├── manifest.json
    ├── assets/
    └── presentation/
        ├── print.css
        └── reference.docx
```

Manifest:

```json
{
  "format": "markdoc-package",
  "version": 1,
  "entry": "document.md",
  "schema": "https://raw.githubusercontent.com/laofahai/mark-doc/main/schemas/markdoc-package-v1.schema.json",
  "spec": "https://github.com/laofahai/mark-doc/blob/main/docs/spec/markdoc-package-v1.md",
  "createdBy": {
    "name": "MarkDoc"
  },
  "presentation": {
    "print": "presentation/print.css",
    "docxReference": "presentation/reference.docx"
  }
}
```

Package version is a format version, not the app version.

`presentation/reference.docx` is optional but supported. When present, it must
travel with the package so DOCX export can be consistent across machines.
Profile identifiers remain stable and language-neutral.

Core package paths are stable:

- `manifest.json`: required and authoritative
- `document.md`: default canonical Markdown entry written by MarkDoc
- `README.md`: optional explanatory hint for humans and AI tools
- `assets/`: default MarkDoc-managed asset directory
- `presentation/`: default MarkDoc-managed presentation directory

```text
MarkDoc writes stable core paths: manifest.json, document.md, README.md,
assets/, and presentation/. Readers must still honor manifest.entry and accept
safe relative resource paths outside assets/ for compatibility.
```

## Security Rules

Package extraction must reject unsafe entries:

```text
../
absolute paths
drive prefixes
symlink escapes
oversized entries
too many files
unsupported resource types
malicious HTML/CSS/JS
SVG script execution
remote resource leakage
```

Every extracted path must canonicalize inside the workspace root.

Remote resources are denied by default. Trust can be enabled in layers:

```text
document-level trust
resource-type trust
domain / URL exception trust
```

The architecture must support all three levels. The UI can expose them
progressively, but the security model cannot collapse them into a single
"allow everything" flag.

Corrupted package recovery should recover as much as possible without executing
or rendering unsafe resources by default. `document.md` and safe local assets can
be restored directly. CSS, SVG, `reference.docx`, remote resources, and other
presentation files should be quarantined until the user enables them in a
recovery/security panel.

## Source Quality Requirements

Markdown source quality is a product feature.

The saved source should:

- contain no default Base64 image blobs
- use relative asset paths
- preserve heading/list/table structure
- avoid unnecessary inline HTML
- avoid proprietary metadata noise
- remain readable with `cat`, searchable with `rg`, and reviewable in Git

## Non-Goals

This architecture does not require MarkDoc to:

- replace Word's full layout engine
- implement arbitrary OOXML layout
- become a knowledge base
- add AI agents immediately
- add cloud sync
- add collaboration
- make package format an industry standard
- support multi-document books as the first document unit

Every new capability must answer:

> Is this improving the document editing experience, or only making Markdown
> more complicated?

If it is only complexity, do not build it.

## AI Scope

The architecture target is AI-ready document source quality.

MarkDoc should make documents easy for AI tools to read, diff, rewrite, compare,
and summarize by keeping Markdown clean and assets explicit. This refactor does
not add AI Agent, RAG, cloud AI service, or autonomous editing behavior.

The AI discoverability contract is deliberately small:

- AI tools can unzip `.mdoc` and inspect `manifest.json`.
- `manifest.schema` points to the machine contract.
- `manifest.spec` and optional packaged `README.md` explain the reading order.
- `manifest.entry` names the canonical semantic source for editing and
  summarization, normally `document.md`.
- Quarantined or remote resources require explicit trust and must not be loaded
  merely because an AI or importer saw them in the package.

It is acceptable to reserve a `DocumentCommand` boundary for later AI features,
but AI features must not drive the document model now.

## Compatibility Targets

MarkDoc Package is the primary format, but the architecture must not dead-end
external compatibility.

The importer/exporter and package layers should preserve a clear mapping path
for:

- MDOCX
- TextBundle / TextPack
- MDZip

The design does not have to make those formats equal to `.mdoc`, but it must
avoid choices that make later import/export impossible without another model
rewrite.

## Internationalization Requirements

i18n must be handled across four layers:

```text
Application UI
  menus, dialogs, toolbar tips, settings, errors, empty states

Editor integration
  Vditor language, placeholders, custom toolbar labels, extension UI

Document semantics
  optional frontmatter lang, locale-aware export defaults, typography profiles

System operations
  importer/exporter errors, package validation messages, recovery prompts
```

Rules:

- no new hardcoded user-facing strings in React components
- all new user-visible text has stable i18n keys
- Chinese and English catalogs must include every new key
- no localized strings stored as stable document/package identifiers
- Rust commands return error codes/message keys, not translated UI text
- tests should assert error codes, not English or Chinese prose
- tests should verify locale key completeness
- presentation profile IDs are stable; labels are translated
- user-created document content is never auto-translated by app i18n
- date/number formatting in UI follows the app locale
- document export formatting may follow document `lang` or selected profile

The current `src/locales/zh.ts` and `src/locales/en.ts` can remain the initial
catalogs, but the refactor should keep domain modules independent from
`react-i18next`.
