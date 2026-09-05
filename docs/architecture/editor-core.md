# MarkDoc Editor Core Architecture

## Decision

MarkDoc should not build a rich text editing engine from scratch.

The final editor direction is:

```text
MarkDoc-owned editor shell
  + Tiptap over ProseMirror as the editing engine
  + MarkDoc-owned Markdown codec and resource bridge
  + .mdoc as the portable package format
```

This means MarkDoc owns the product behavior, storage contract, toolbar, asset
pipeline, security policy, i18n, and document commands. The browser editing
model, selection, IME behavior, transaction system, history, and schema mechanics
should come from ProseMirror through Tiptap.

Vditor is not part of the final editor architecture. Do not preserve it as an
alternate production adapter. The implementation should replace it directly and
remove the old coupling as part of the editor-core work.

Tiptap is not the storage protocol. ProseMirror JSON is not the storage protocol.
Tiptap's Markdown extension is not automatically trusted as the canonical codec.
Only a MarkDoc-owned `MarkdownCodec` that passes the MarkDoc round-trip fixtures
is allowed in the save path.

## Why Not Keep Extending Vditor

Vditor is a good drop-in Markdown editor. It is not a good long-term product
core for MarkDoc because the current integration already depends on implementation
details:

- `src/components/Editor/Editor.tsx` moves the internal Vditor toolbar DOM into a
  custom host.
- `src/components/Editor/resource-policy.ts` patches Vditor/Lute conversion
  internals to recover canonical Markdown and block unsafe rendered resources.
- `src/components/Editor/color-formatting.ts` reads and mutates Vditor mode and
  range internals to make WYSIWYG colors survive.
- `src/styles/vditor.css` is a large override layer for toolbar, popovers,
  tables, panels, counters, layout, and transparent surfaces.
- `src/components/Sidebar.tsx` finds headings through `.vditor-*` DOM selectors.

These are not isolated skinning issues. They show that app behavior is leaking
through Vditor's private DOM instead of a stable editor contract. More toolbar
work, block interactions, asset handling, AI commands, and presentation controls
would add more coupling.

## Vditor Coupling To Remove

The editor-core migration must remove these dependencies:

- direct `vditor` and `vditor/dist/index.css` imports in the active editor path
- Vditor toolbar DOM relocation from `editor.vditor.toolbar.element`
- Vditor toolbar entry names as MarkDoc command identifiers
- SVG strings built for Vditor toolbar consumption
- `vditor.currentMode`, `vditor.wysiwyg`, `vditor.ir`, and stored Vditor ranges
  in application code
- Lute monkey patching for `Md2VditorDOM`, `Md2VditorIRDOM`,
  `SpinVditorDOM`, `SpinVditorIRDOM`, `VditorDOM2Md`, and `VditorIRDOM2Md`
- `.vditor-*` selectors in sidebar outline, keyboard routing, right-click
  policy, and selection policy
- Vditor-specific CSS overrides in the active app stylesheet
- tests whose only assertion is that Vditor internals were manipulated

The current general-purpose resource policy code can be preserved if it remains
editor-agnostic. The Vditor/Lute integration branch should be replaced by
schema/node-view/codec behavior in the new editor core, then deleted.

## Why Not Build The Engine Ourselves

A desktop WYSIWYG Markdown editor needs correct behavior for:

- Chinese and English input methods
- selection and range persistence
- undo and redo history
- paste, drag, drop, and clipboard normalization
- links, images, tables, lists, task lists, and code blocks
- Markdown parsing and serialization
- schema validation and command enablement
- browser-specific contenteditable behavior
- accessibility and keyboard navigation

Those are editor-engine problems, not MarkDoc product problems. Building them
from scratch would make the editor itself the project. MarkDoc's differentiator
is clean document storage, `.mdoc`, asset packaging, Word handoff, and a polished
desktop writing workflow.

## Why Tiptap Over ProseMirror

ProseMirror is the correct underlying model because it gives explicit schemas,
transactions, plugins, selections, and history. It also avoids treating the
document as a loose HTML blob.

Tiptap is the right integration layer because it is headless and has first-class
React integration. MarkDoc can render its own toolbar, menus, popovers, bubble
toolbar, and command UI while using public editor commands and active-state
checks.

Raw ProseMirror should remain an escape hatch for custom extensions, but using
it directly for the whole app would add too much low-level framework work.

## Why Not Milkdown As The Primary Choice

Milkdown is a serious alternative. It is Markdown-first, built on ProseMirror and
remark, and supports CommonMark/GFM through presets.

It is not the primary recommendation because MarkDoc needs maximum control over
the product shell, document commands, asset bridge, security policy, and future
custom nodes. Tiptap's headless command model and React menus map more directly
to the architecture MarkDoc is already moving toward.

Milkdown remains the fallback candidate if Tiptap's Markdown support proves too
unstable against MarkDoc's round-trip fixtures.

## Option Summary

```text
Tiptap over ProseMirror
  Use as final editor core.
  Best match for MarkDoc-owned UI, schema, commands, toolbar state, node views,
  selection behavior, history, and future custom extensions.

Raw ProseMirror
  Keep as an escape hatch inside custom extensions.
  Do not use as the main app integration layer unless Tiptap blocks a required
  behavior.

Milkdown
  Keep as the fallback candidate if Tiptap Markdown fixtures fail in a way that
  cannot be fixed locally.

Vditor
  Remove from the production editor path.
  Do not keep it as an alternate adapter.

Self-built contenteditable engine
  Do not pursue.
  It would shift the project from document product work to browser editor engine
  work.
```

## Markdown Is Still Canonical

The editor may keep an internal ProseMirror/Tiptap JSON document while editing.
That JSON must not become the stored product format.

The source of truth remains:

```text
plain Markdown document
  -> markdown file content

.mdoc package
  -> manifest.json
  -> manifest.entry, normally document.md
  -> assets/ and presentation/ resources
```

Rules:

- Save operations call the editor adapter for the latest Markdown before writing.
- Tiptap JSON is runtime state only.
- `.mdoc` packages store clean Markdown and explicit resources.
- Base64 image data is allowed only as transient paste/import input or historical
  document content. It must not be the default persisted image strategy.
- Package paths remain UTF-8 relative paths with `/` separators.
- Absolute paths, drive-prefix paths, backslashes, and `..` traversal remain
  invalid inside package references.

## Markdown Codec

Introduce a MarkDoc-owned codec boundary:

```ts
interface MarkdownCodec {
  parse(markdown: string): EditorDocument
  serialize(document: EditorDocument): string
  normalize(markdown: string): string
}
```

Initial implementation can use Tiptap's Markdown extension, but the extension is
a replaceable implementation detail. The extension is currently a beta surface
in Tiptap's documentation, so it must be treated as an implementation candidate,
not as the source of truth. The codec is accepted only when MarkDoc fixtures
round-trip.

Required fixtures:

- headings from level 1 to 6
- paragraphs, hard breaks, emphasis, strong, strike
- blockquotes
- bullet, ordered, and task lists
- fenced code blocks and inline code
- links and images
- GFM tables
- horizontal rules
- frontmatter preservation
- raw HTML compatibility cases
- inline text color and background color
- relative `assets/...` references
- remote image references kept in source but blocked in render by default
- pasted-image Markdown generated from package assets
- DOCX-imported Markdown with extracted media

Unsupported or lossy syntax must be explicit. The editor may preserve unknown
Markdown as raw blocks only when it can round-trip without executing unsafe HTML.

If a fixture fails, do not silently normalize the document into a lossy shape.
Either add a MarkDoc codec rule, mark the syntax unsupported with a visible
import/open warning, or block the editor-core switch until the loss is fixed.

## Editor Adapter Contract

The application should depend on a stable editor adapter, not Vditor or Tiptap
objects.

Target shape:

```ts
type EditorCommand =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'blockquote'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'heading'
  | 'inlineCode'
  | 'codeBlock'
  | 'link'
  | 'image'
  | 'attachment'
  | 'table'
  | 'horizontalRule'
  | 'textColor'
  | 'backgroundColor'
  | 'clearFormatting'

interface DocumentEditorAdapter {
  getMarkdown(): string
  setMarkdown(markdown: string, options?: { preserveHistory?: boolean }): void
  focus(): void
  blur(): void
  canRun(command: EditorCommand, attrs?: Record<string, unknown>): boolean
  isActive(command: EditorCommand, attrs?: Record<string, unknown>): boolean
  run(command: EditorCommand, attrs?: Record<string, unknown>): boolean
  insertImage(asset: AssetRef): void
  insertAttachment(asset: AssetRef): void
  scrollToOutlineItem(id: string): boolean
  dispose(): void
}
```

The adapter is allowed to translate these calls into Tiptap commands. No document
service, sidebar, command bar, importer, exporter, or package service should
import Tiptap or ProseMirror types.

## Component Boundaries

Target files:

```text
src/editor-core/
  types.ts
  commands.ts
  markdown-codec.ts
  markdoc-extensions.ts
  asset-bridge.ts
  resource-security.ts
  outline.ts

src/components/Editor/
  EditorShell.tsx
  EditorToolbar.tsx
  EditorBubbleToolbar.tsx
  EditorPopoverLayer.tsx
  TiptapMarkDocEditor.tsx
```

Responsibilities:

- `EditorShell` owns layout, toolbar placement, popover placement, keyboard
  routing, and i18n labels.
- `TiptapMarkDocEditor` owns the Tiptap instance and extension list.
- `MarkdownCodec` owns Markdown parsing and serialization.
- `AssetBridge` owns paste/drop/upload conversion into `assets/` references.
- `resource-security` owns render-time and command-time resource policy.
- `outline` owns heading extraction and editor scroll targets.
- `DocumentContext` owns open/save/recovery/resource suggestions, not editor DOM.

## Data Flow

```text
Open file/package
  -> DocumentService
  -> DocumentModel(markdown, workspace, assets, presentation)
  -> EditorShell
  -> TiptapMarkDocEditor parses markdown

Edit document
  -> Tiptap transaction
  -> adapter marks dirty and emits throttled Markdown snapshots
  -> DocumentContext updates active markdown for outline, counters, and save UI

Save
  -> DocumentContext asks adapter.getMarkdown()
  -> DocumentService writes .md/.txt/.mdoc according to save strategy

Paste/drop/upload image
  -> AssetBridge receives File/Clipboard data
  -> DocumentContext.importActiveImageAsset writes workspace asset
  -> adapter inserts image with package-relative markdown path
  -> Markdown source contains ![image](assets/...)

Render local asset
  -> editor node keeps package-relative src
  -> view resolves display URL through workspace resolver
  -> serialized Markdown restores the relative path
```

`onUpdate` should not be the only save source. It can lag behind React state.
Every save path must call `adapter.getMarkdown()` immediately before writing.

## Toolbar And Menus

The final toolbar is a MarkDoc React component. It must not be moved out of an
editor library DOM tree.

Rules:

- document commands stay in the shell/header command bar
- formatting commands live in the editor toolbar or selection bubble toolbar
- popovers are rendered by MarkDoc, not by Vditor internals
- active button state comes from `adapter.isActive`
- disabled state comes from `adapter.canRun`
- tooltips and labels come from i18n keys
- upload/paste flows go through `AssetBridge`

Expected formatting controls:

- heading
- bold, italic, strike
- quote
- bullet list, ordered list, task list
- inline code, code block
- link
- table
- upload image
- text color
- background color
- horizontal rule
- emoji

Undo and redo can stay keyboard-first. They should not be toolbar buttons unless
user testing proves they are needed.

The toolbar must be implementation-neutral. Button IDs are MarkDoc command IDs,
not Tiptap extension names and not Vditor toolbar names.

## Color And Background Marks

Markdown has no standard syntax for arbitrary text color. MarkDoc should support
colors as a controlled compatibility feature, not as a new proprietary syntax.

Rules:

- text color serializes to sanitized inline HTML spans
- background color serializes to sanitized inline HTML spans
- only `color` and `background-color` style properties are allowed for these marks
- color values must be normalized hex or a strict allowlist
- background palette uses light highlight colors by default
- documents that do not use color should not gain inline HTML

This keeps normal Markdown clean while still supporting explicit rich formatting.

## Tables

The canonical Markdown table format is GFM table syntax.

Rules:

- basic rows, columns, alignment, and cell text are supported
- table editing may use richer ProseMirror/Tiptap table commands at runtime
- saved Markdown must not silently introduce unsupported layout metadata
- merged cells, column widths, cell backgrounds, captions, and resize state are
  not part of canonical Markdown unless a future presentation resource explicitly
  owns them
- DOCX export may render a clean Markdown table into a styled Word table

This keeps table editing useful without pretending Markdown can store arbitrary
Word-style table layout.

## Resource Security

The editor must never make unsafe resource loading a side effect of parsing
Markdown.

Rules:

- package-relative assets are resolved through the active workspace only
- remote images, styles, fonts, scripts, iframes, video, audio, object, embed,
  SVG references, and `srcdoc` are blocked by default according to
  `PackageSecurityPolicy`
- source Markdown may preserve blocked remote references, but render must not load
  them until the user enables the relevant trust layer
- pasted `data:` images are imported into assets when possible
- `javascript:` and other active URL schemes are rejected
- raw HTML is parsed only through a sanitizer and whitelist

With Tiptap, prefer schema marks/nodes and node views over post-render DOM
mutation. A final implementation should remove the current Vditor/Lute monkey
patching path.

## Outline

The sidebar outline must not query Vditor DOM.

Target behavior:

- extract outline from the canonical editor document or Markdown codec
- keep stable heading IDs for repeated headings
- expose `scrollToOutlineItem(id)` through the adapter
- update active outline item from editor selection or scroll position
- avoid focus jumps after clicking an outline item

The sidebar can remain responsible for rendering the outline UI. It should not
know whether the active editor is Vditor, Tiptap, or another adapter.

Current outline behavior to preserve:

- outline is the default sidebar view when a document is active
- users can switch between outline and current-folder file tree
- outline items can be collapsed and expanded
- a header control can collapse or expand all collapsible outline sections
- the current heading is highlighted after selection or navigation
- headings inside fenced code blocks are ignored

## i18n

The editor architecture must keep three languages separate:

- UI language: toolbar tips, menus, dialogs, errors, settings
- editor integration language: editor placeholder and any extension UI
- document language: frontmatter `lang`, typography, spellcheck, export defaults

Rules:

- no hardcoded user-visible strings in editor React components
- all editor labels have `src/locales/zh.ts` and `src/locales/en.ts` keys
- stored command IDs and profile IDs remain language-neutral
- document content is never translated by app i18n

Editor feature tests should assert stable command IDs and locale keys, not
English or Chinese display text.

## Direct Replacement Order

The final target is the Tiptap/ProseMirror editor core described above. The
implementation order is direct replacement, not a long-lived split editor
architecture.

```text
1. Freeze and expand the adapter contract around MarkDoc command IDs
2. Add Markdown fixtures and static guards before the editor swap
3. Implement Tiptap editor core behind the adapter contract
4. Port toolbar, popovers, paste/upload, resource rendering, outline, and color
   marks to the MarkDoc-owned shell and extensions
5. Switch the active app editor to Tiptap
6. Delete Vditor dependency, Vditor CSS, Vditor files, Vditor tests, and stale TipTap test
   aliases that no longer match installed packages
```

Do not stop with Vditor kept on the side. The cleanup is part of the same final
direction and should land with the editor-core replacement.

## Acceptance Criteria

The editor-core work is complete only when:

- no production document flow imports `vditor`
- `src/styles/vditor.css` is gone
- no sidebar, toolbar, document command, save, export, or security code queries
  `.vditor-*` DOM
- `DocumentContext` still calls `adapter.getMarkdown()` before every save
- `.mdoc` package round-trip preserves Markdown and `assets/` references
- plain `.md` without resources saves in place without `.mdoc` suggestion
- plain `.md` with newly imported assets suggests `.mdoc` without blocking `.md`
  save
- pasted screenshots become `assets/...` references, not default Base64 blobs
- DOCX-imported images render through workspace asset URLs
- text color and background color work in WYSIWYG and serialize predictably
- toolbar popovers render above the editor and remain clickable
- outline click scrolls to the heading without later jumping to the top
- A4/Letter and portrait/landscape page layout affect the editor paper surface
  and desktop print CSS without polluting Markdown
- Chinese and English UI keys are complete
- unit, integration, and real Tauri smoke tests pass

## Test Matrix

Existing coverage to preserve:

- document model and save strategy tests for `.md`, `.txt`, `.mdoc`, imported
  DOCX, save failure recovery, dirty state, self-save watcher suppression, and
  resource suggestions
- package import/export tests for manifest identity, custom `manifest.entry`,
  stable paths, unknown field preservation, resource limits, recovery, missing
  presentation warnings, and safe extraction
- asset tests for local references, remote references, Base64 detection, and
  pasted image asset import
- security tests for default remote-resource rejection and type/domain/URL trust
  scopes
- command bar, sidebar, recovery/security panel, i18n, and native-file tests
  around current document workflows

Missing coverage that must be added before switching the active app editor to
Tiptap:

- adapter contract tests for the MarkDoc editor contract
- static guard tests that fail if production flows import `vditor`, query
  `.vditor-*`, include `src/styles/vditor.css`, or keep Vditor files in the
  active editor tree
- fixture-driven Markdown codec tests with golden input/output files
- real `.mdoc` fixture tests for minimal packages, custom entries, assets,
  presentation resources, missing resources, corrupted packages, over-limit
  packages, and malicious paths/resources
- DOCX fixture tests containing Chinese text, tables, images, and links
- renderer integration tests for MarkDoc-owned toolbar, popovers, selection
  persistence, outline scrolling, and asset bridge behavior

Unit tests:

- Markdown codec fixture round-trips
- command registry maps stable command IDs to editor operations
- color/background mark parsing and serialization
- resource URL allow/block behavior
- asset reference normalization
- outline extraction and duplicate heading IDs
- i18n key completeness

React integration tests:

- toolbar active/disabled states
- popover positioning and click behavior
- paste/upload calls the asset bridge
- outline click calls adapter scroll
- save uses live adapter Markdown even when React state lags

Tauri smoke tests:

- open `.md`, edit, save in place
- open `.md`, paste screenshot, save as `.mdoc`
- open `.mdoc`, verify image render, edit, save, reopen
- import `.docx` with media, verify image render, save as `.mdoc`, export DOCX
- open file dialog and folder sidebar do not hang
- external file change prompt does not trigger after self-save

## References

- Vditor README and API: <https://github.com/vanessa219/vditor>
- Tiptap editor docs: <https://tiptap.dev/docs/editor>
- Tiptap Markdown docs: <https://tiptap.dev/docs/editor/markdown>
- ProseMirror guide: <https://prosemirror.net/docs/guide/>
- Milkdown docs: <https://milkdown.dev/docs>
