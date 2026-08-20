# MarkDoc Architecture Refactor Design

## Goal

Refactor MarkDoc around the final `DocumentWorkspace` architecture now. Do not
preserve `filePath + content` as the application core.

The implementation can be delivered as vertical slices, but every new boundary
must match the final model:

```text
open source
  -> importer
  -> DocumentModel / DocumentWorkspace
  -> editor adapter
  -> save strategy / exporter
```

If the current code becomes more expensive to untangle than to replace, a
controlled rebuild is acceptable. The deciding factor is not whether files are
old or new; it is whether the resulting architecture is clearer, easier to
verify, and closer to the final model.

## Current Coupling

### FileContext

Current file:

```text
src/contexts/FileContext.tsx
```

Current responsibilities:

- tab state
- active tab state
- recent files
- file open dialog
- Markdown file reading
- DOCX import trigger
- dirty state
- external change detection
- file association handling
- reload behavior

Problem:

`FileContext` is the current application core. It stores each tab as:

```ts
interface FileTab {
  id: string
  path: string
  name: string
  sourceType: "md" | "docx"
  content: string
  isDirty: boolean
  referenceDocxPath?: string
}
```

This model cannot represent workspace assets, presentation resources, package
state, imported DOCX lifecycle, or save strategies cleanly.

Target:

Replace `FileTab` with:

```ts
interface DocumentTab {
  id: string
  documentId: string
  viewState: EditorViewState
}
```

Document state belongs to a document store/service:

```ts
interface DocumentSession {
  document: DocumentModel
  saveState: SaveState
  externalState: ExternalState
}
```

`FileContext` should become `DocumentTabsContext` or a thin UI session context.

It must not own localized messages. It should expose state and stable action
results; UI components translate labels, prompts, and error messages.

### Frontend File Service

Current file:

```text
src/services/file.ts
```

Current responsibilities:

- Save As Markdown
- Save As DOCX
- existing-path save
- Markdown-to-DOCX conversion
- temporary markdown file creation
- reference.docx option handling
- Mermaid/Base64 export preprocessing

Problem:

Saving, exporting, presentation, and conversion are mixed.

Target split:

```text
src/services/document/
├── DocumentService.ts
├── WorkspaceService.ts
├── SaveStrategy.ts
├── DocumentSessionStore.ts
├── RecoveryService.ts
└── ExternalChangeService.ts

src/services/importers/
├── MarkdownImporter.ts
├── DocxImporter.ts
└── PackageImporter.ts

src/services/exporters/
├── MarkdownExporter.ts
├── DocxExporter.ts
└── PackageExporter.ts

src/services/assets/
└── AssetManager.ts

src/services/presentation/
└── PresentationService.ts

src/services/security/
└── PackageSecurityPolicy.ts
```

All service APIs that can fail should return typed errors:

```ts
type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: DocumentError }
```

`DocumentError.messageKey` is translated at the UI boundary.

### Export Preprocess

Current file:

```text
src/services/export-preprocess.ts
```

Current responsibilities:

- render Mermaid to temporary PNG
- extract Base64 images to temporary files
- rewrite Markdown for Pandoc
- cleanup temporary files

Problem:

This is a conversion patch, not a document asset model.

Target:

- Mermaid source remains canonical Markdown.
- Generated Mermaid PNG is a derived export artifact.
- Base64 image extraction becomes migration/import behavior.
- Export preprocessing becomes `DocxExportPreprocessor`.
- Asset persistence belongs to `AssetManager`.

### Rust Converter

Current file:

```text
src-tauri/src/converter.rs
```

Current responsibilities:

- binary lookup
- Pandoc conversion
- DOCX import
- DOCX export
- DOCX post-processing
- color extraction
- image Base64 embedding
- blockquote cleanup
- Pandoc availability check
- Pandoc installation

Problem:

The Rust side mixes low-level process execution, document import rules,
presentation fixes, migration behavior, and dependency management.

Target split:

```text
src-tauri/src/
├── pandoc/
│   ├── mod.rs
│   ├── binary.rs
│   ├── convert.rs
│   └── health.rs
├── document/
│   ├── mod.rs
│   ├── docx_import.rs
│   ├── docx_export.rs
│   └── workspace.rs
├── assets/
│   ├── mod.rs
│   └── media.rs
├── package/
│   ├── mod.rs
│   ├── reader.rs
│   ├── writer.rs
│   └── validator.rs
└── presentation/
    ├── mod.rs
    └── docx_reference.rs
```

Pandoc commands exposed to the frontend should be document-level commands such
as `import_docx_to_workspace` and `export_workspace_to_docx`, not generic
frontend-managed command lines.

### Editor Component

Current file:

```text
src/components/Editor/Editor.tsx
```

Current responsibilities:

- Vditor lifecycle
- toolbar configuration
- color picker DOM manipulation
- markdown change events
- portal toolbar mounting
- theme/language integration

Problem:

Vditor is acting as the document editor core.

Target:

Keep Vditor, but wrap it with an adapter:

```text
src/components/Editor/
├── Editor.tsx
├── VditorEditorAdapter.ts
├── editor-adapter.ts
└── toolbar/
```

The rest of the app should depend on `DocumentEditorAdapter`, not on Vditor.

Editor locale must be passed through the adapter instead of being read ad hoc in
editor internals:

```ts
interface EditorAdapterOptions {
  uiLanguage: "zh" | "en"
  editorLanguage: "zh_CN" | "en_US"
  documentLanguage?: string
}
```

Custom toolbar labels, color picker labels, placeholders, and editor extension
UI must use i18n keys.

### i18n Catalogs

Current files:

```text
src/locales/zh.ts
src/locales/en.ts
```

Target:

Keep the catalogs, but organize keys by product boundary:

```text
app.*
editor.*
document.*
workspace.*
assets.*
presentation.*
import.*
export.*
package.*
security.*
recovery.*
errors.*
```

Rules:

- React components call translation hooks.
- Domain services return message keys.
- Rust commands return stable error codes/message keys.
- Tests assert codes and keys, not translated prose.
- Stored package/profile identifiers are never localized display labels.

## Target Runtime Flow

### Open Markdown

```text
User opens report.md
  -> MarkdownImporter
  -> DocumentWorkspace(storage: virtual-markdown)
  -> DocumentModel
  -> DocumentSession
  -> EditorAdapter.setMarkdown()
```

No package is created. No manifest is created. Plain Markdown remains a first
class citizen.

The document may contain frontmatter `lang`, but application UI language remains
independent.

If the Markdown already references local images or attachments, MarkDoc should
show a non-blocking portability suggestion for `.mdoc`. If the user declines,
`Cmd+S` keeps saving the original `.md`.

### Open DOCX

```text
User opens report.docx
  -> DocxImporter
  -> Rust document import command
  -> Pandoc with extract-media
  -> workspace/document.md
  -> workspace/assets/*
  -> optional workspace/presentation/reference.docx
  -> DocumentModel(source: imported-docx)
```

Imported DOCX is not the canonical live source.

If DOCX metadata exposes document language, import it as document metadata when
reliable. Do not infer UI language from imported document content.

`Cmd+S` for an imported DOCX saves the editable canonical document as `.mdoc`
by default. It must not overwrite the original DOCX. Exporting DOCX is an
explicit delivery action.

### Paste Or Drop Image

```text
clipboard/drop image
  -> AssetManager.importBytes/importFile
  -> collision-safe relative asset path
  -> EditorAdapter.insertImage()
  -> Markdown references assets/image-xxx.png
```

Default persisted Markdown must not contain Base64.

When the current source is plain `.md`, adding a new imported asset changes the
default Save As target to `.mdoc` so resources travel with the document.

### Save New Document

```text
New document
  -> default Save As target: .mdoc
  -> alternate target: .md
```

The save dialog should make `.mdoc` the default MarkDoc document choice while
keeping `.md` visibly available.

### Save Markdown

```text
DocumentModel(source: markdown)
  -> MarkdownSaveStrategy
  -> write original .md
  -> write/copy referenced local assets if needed
```

The save action must not silently convert a plain `.md` into a package.

### Export DOCX

```text
DocumentModel
  -> DocxExporter
  -> resolve assets
  -> render derived Mermaid images
  -> apply presentation config
  -> Pandoc
  -> DOCX post-processing
```

DOCX is output, not source of truth.

### Save Package

```text
DocumentModel
  -> PackageExporter
  -> write temporary ZIP
  -> validate manifest and entry paths
  -> atomic replace
```

`.mdoc` save/load should be built as the package representation of
`DocumentWorkspace`.

Package identity and AI/tool discoverability live in `manifest.json`. A `.mdoc`
writer should include stable `format`, `version`, `entry`, `schema`, and `spec`
fields so external validators and AI tools can understand the package without
MarkDoc installed. A packaged `README.md` may be generated as a human/AI hint,
but it is explanatory only; readers must treat the manifest as the authority.

```text
DOCX and PDF are delivery formats; Markdown remains the canonical semantic source whenever possible.
```

```text
Manifest metadata is authoritative. Packaged README text is explanatory only.
AI tools should discover `.mdoc` by unzipping the package, reading
manifest.json, following schema/spec metadata, and treating manifest.entry as
the canonical semantic source.
```

```text
MarkDoc writes stable core paths: manifest.json, document.md, README.md,
assets/, and presentation/. Readers must still honor manifest.entry and accept
safe relative resource paths outside assets/ for compatibility.
```

The package writer must use atomic replacement and recovery metadata. The
priority order is:

```text
user content is not lost
> original file is not corrupted
> failure is hidden from the user
```

Cloud sync locks, permission failures, version conflicts, and interrupted writes
enter the same recovery surface as package save failures.

### External Modification

```text
Opened .mdoc modified outside MarkDoc
  + current session dirty
  -> no automatic merge
  -> offer: keep current, save as, discard and reload
```

MarkDoc should not attempt automatic three-way merge across Markdown, assets,
and presentation resources by default. A merge tool can be built on top of
DocumentWorkspace snapshots when that becomes an explicit product requirement.

## Module Boundaries

### DocumentService

Owns document sessions and high-level operations:

```ts
open(source: ImportSource): Promise<DocumentSession>
save(sessionId: string): Promise<void>
saveAs(sessionId: string, target: SaveTarget): Promise<void>
export(sessionId: string, target: ExportTarget): Promise<ExportResult>
close(sessionId: string): Promise<void>
```

It coordinates importers, exporters, save strategies, and tabs. It does not know
Pandoc command-line details.

### WorkspaceService

Owns workspace creation, path resolution, recovery roots, and cleanup.

```ts
createForMarkdown(path: string): Promise<DocumentWorkspace>
createTemporary(kind: string): Promise<DocumentWorkspace>
resolvePath(workspace: DocumentWorkspace, relativePath: string): string
```

### RecoveryService

Owns save failure state, recovery drafts, previous recoverable versions, and
cloud/sync conflict recovery.

It should expose enough state for the UI to explain whether:

- content is safe in a recovery draft
- the original file is unchanged
- the package replacement failed
- a cloud/sync lock or external version conflict was detected
- the user should retry, save as, restore, or discard

### AssetManager

Owns content assets. It never owns presentation resources.

Required behavior:

- generate safe filenames
- deduplicate by hash when practical
- reject absolute paths in persisted Markdown
- validate references
- detect orphans
- migrate Base64 image references to asset files

### PresentationService

Owns built-in profiles, custom reference docs, screen/print CSS, and document
presentation overrides.

Priority:

```text
document presentation
> user default
> built-in default
```

Presentation profile IDs must be stable and language-neutral. Labels and
descriptions are translated by i18n catalogs.

### PackageSecurityPolicy

Owns package trust decisions:

- remote resources denied by default
- document-level trust
- resource-type trust
- domain / URL exception trust
- quarantine decisions for CSS, SVG, `reference.docx`, and remote resources
- safe read-only recovery of corrupted packages

### Importers

Importers produce `DocumentModel`.

They are allowed to create workspaces and assets. They are not allowed to make
UI decisions.

### Exporters

Exporters consume `DocumentModel`.

They are allowed to create temporary derived files. They are not allowed to
mutate canonical Markdown unless the user explicitly runs a migration.

## Compatibility Rules

### Existing Markdown With Base64

Existing user documents may contain Base64 images. Opening them must continue to
work.

Add explicit migration:

```text
Extract embedded images
  -> write assets/image-xxx.png
  -> rewrite Markdown relative paths
```

Do not silently rewrite user files without confirmation.

### Existing DOCX Save Behavior

Current app can open DOCX and save back to DOCX. The new model should avoid
silent destructive overwrites.

Recommended behavior:

- Open DOCX imports to workspace.
- Primary save asks for Markdown/package target if no canonical MarkDoc source
  exists.
- Export DOCX remains explicit and can use original DOCX as presentation
  reference.

### Plain Markdown

Opening and saving `README.md` must remain direct and simple.

No forced package.
No forced manifest.
No hidden proprietary metadata.

Existing local resource references only trigger a non-blocking `.mdoc`
suggestion. Newly imported assets default the next Save As operation to `.mdoc`.

### External Package Formats

MarkDoc Package remains the primary format. The architecture must preserve a
mapping path for MDOCX, TextBundle/TextPack, and MDZip through the
importer/exporter layer. These formats do not define the internal model.

## Testing Requirements

Add fixture-driven tests around document semantics, not only component behavior.

Required test groups:

- Markdown open/save preserves source.
- DOCX import extracts media to assets instead of Base64.
- Asset paths are relative and collision safe.
- Markdown export does not introduce package metadata.
- DOCX export resolves assets correctly.
- Package reader rejects path traversal.
- Package reader identifies `.mdoc` by manifest, not extension alone.
- Package writer round-trips document.md and assets.
- Package writer uses atomic replacement and exposes recovery state on failure.
- Corrupted package recovery quarantines unsafe presentation resources.
- Remote resources are denied by default and governed by layered trust policy.
- External modification of dirty `.mdoc` does not auto-merge.
- Source quality checks reject large default Base64 blobs.
- i18n tests verify every supported locale contains required keys.
- service/Rust errors expose stable codes and message keys.

## Implementation Policy

This is a final-architecture refactor, not a temporary bridge.

Acceptable:

- introduce final interfaces before every implementation is complete
- migrate one user path at a time through final interfaces
- keep old APIs briefly as compatibility wrappers

Not acceptable:

- add more behavior to `FileTab.content`
- keep Base64 as the default persisted image strategy
- let frontend construct Pandoc command lines directly
- make `.mdoc` the architecture center
- make Vditor the domain model
- silently convert plain Markdown into proprietary package state
- hardcode new user-visible text outside i18n catalogs
- hide save failures that may affect user content

### Rebuild Policy

Starting from a clean implementation is allowed when refactoring the existing
code would mainly preserve bad boundaries.

Preserve or port these assets/capabilities when rebuilding:

- product behavior that works today: Markdown edit, DOCX import/export, tabs,
  file tree, file association, external change detection, i18n, theme, settings
- built-in `reference.docx`
- color export Lua filter
- proven DOCX post-processing behavior
- existing translations after reorganizing keys
- tests that still describe desired behavior

Do not preserve these as architecture:

- `FileTab.content` as document core
- Base64 image persistence as default
- frontend-managed Pandoc command assembly
- mixed UI/domain error strings
- Vditor as domain model

The practical approach can be:

```text
Build new document core beside old UI
  -> move one complete user path onto it
  -> delete old path once equivalent behavior passes tests
```

or, if the old shell blocks progress:

```text
Create a new app shell around DocumentWorkspace
  -> port editor and conversion capabilities
  -> port i18n/theme/settings
  -> remove obsolete modules
```

Either way, the architecture target is the same.

## Completion Criteria

The refactor is successful when these paths naturally use the same architecture:

```text
Open README.md -> edit -> save
Open existing .md with local images -> suggest .mdoc -> allow in-place .md save
Open DOCX -> workspace with assets -> edit -> export DOCX
Open DOCX -> edit -> Cmd+S -> save canonical .mdoc, not original DOCX
New document -> save dialog defaults to .mdoc and allows .md
New document -> paste image -> .mdoc with clean Markdown relative asset path
Save .mdoc -> unzip -> document.md is readable
Save .mdoc fails -> content remains recoverable and original file is not corrupted
Corrupted .mdoc -> safe recovery mode restores readable content and quarantines unsafe resources
Delete presentation/ -> document meaning still survives
```

The final source quality bar:

> If MarkDoc is uninstalled, the user still has a clean, open, understandable,
> migratable document that humans, Git, search tools, and AI can continue to
> use.

For `.mdoc`, that means AI tools can unzip the file, read `manifest.json`, follow
`schema` or `spec` for the format contract, then use `manifest.entry` as the
canonical semantic source. The optional packaged README is a prompt-friendly
guide, not a second source of truth.
