# Task 12 Report: Replace Legacy File Save/Open Paths With DocumentService

## Status

Complete.

## What I Implemented

- Added the `extract_mdoc_package` Tauri command. It validates the manifest through the existing reader policy, extracts only safe non-quarantined entries, writes a self-describing `manifest.json`, and returns the extracted workspace and entry paths.
- Added `PackageImporter.open()` to extract an `.mdoc`, read its manifest entry, and construct a clean package-backed `DocumentModel`.
- Added `DocumentService` path routing for Markdown, DOCX, and `.mdoc`, document save orchestration driven by `resolveSaveTarget()`, and DOCX export through `DocxExporter`.
- Extended `DocumentContext` with `openFileFromPath`, `saveActiveDocument`, and `exportActiveDocx`.
- Routed document toolbar/open/recent-file/DOCX export actions in `EditorPage` through `DocumentContext`; `FileContext` is explicitly marked as compatibility-only.
- Corrected DOCX import to load markdown from the extractor's workspace entry.

## Prerequisite Resolution

- `src/services/importers/PackageImporter.ts` only exposes `inspect(path)`, which invokes `read_mdoc_package` to validate and inspect a package manifest.
- No frontend call site, Rust command, or registered Tauri command exists to extract an `.mdoc` package into a workspace.
- `src-tauri/src/package/reader.rs` reads and validates package entries only; it does not extract them.
- Task 12 explicitly requires `.mdoc` opening to use `PackageImporter.inspect(path)` plus the Task 4 workspace extraction command. Implementing `.mdoc` as text, or inventing an incompatible extraction protocol, would violate the task constraints.

## Tests

- `npm test -- src/services/importers/__tests__/PackageImporter.test.ts`: 1 passed.
- `npm test -- src/services/document/__tests__/docx-import-export.test.ts src/services/document/__tests__/document-service-save.test.ts src/contexts/__tests__/DocumentContext.test.tsx src/services/importers/__tests__/PackageImporter.test.ts`: 13 passed.
- `npm test`: 14 files and 55 tests passed.
- `npm run build:check`: passed (`tsc -b && vite build`). Vite emitted its existing chunk-size warning only.
- `cargo test`: 30 passed.

## TDD Evidence

- RED: `cargo test package::reader::tests::extracts_only_safe_entries_and_writes_manifest` failed with `cannot find function extract_mdoc_package`.
- GREEN: the same Rust test passed after implementation, verifying entry content, manifest copy, quarantine skipping, and no traversal write.
- RED: `npm test -- src/services/importers/__tests__/PackageImporter.test.ts` failed with `PackageImporter().open is not a function`.
- GREEN: the same test passed after implementation, asserting the extracted workspace becomes a clean package document.
- RED: `npm test -- src/services/document/__tests__/docx-import-export.test.ts` failed because imported DOCX markdown was empty.
- GREEN: the DOCX importer test passed after loading the extracted markdown entry.
- RED: the DocumentContext API test failed because `openFileFromPath` was undefined; the required save-strategy tests remained green.
- GREEN: the focused context/save/import tests passed after adding DocumentContext/DocumentService actions.

## Files Changed

- `src-tauri/src/lib.rs`
- `src-tauri/src/package/mod.rs`
- `src-tauri/src/package/reader.rs`
- `src/contexts/DocumentContext.tsx`
- `src/contexts/FileContext.tsx`
- `src/contexts/__tests__/DocumentContext.test.tsx`
- `src/pages/EditorPage.tsx`
- `src/services/document/document-service.ts`
- `src/services/document/__tests__/document-service-save.test.ts`
- `src/services/document/__tests__/docx-import-export.test.ts`
- `src/services/importers/DocxImporter.ts`
- `src/services/importers/PackageImporter.ts`
- `src/services/importers/__tests__/PackageImporter.test.ts`

## Self-review Findings

- Package extraction revalidates each entry immediately before writing and relies on the existing safe-path, URL, and quarantine rules.
- DOCX primary save follows the existing strategy: it prompts for `.mdoc` or `.md` and never writes over the original DOCX.
- Document toolbar flows no longer use legacy Pandoc conversion. FileContext remains for old file tabs, sidebar, and recent-file compatibility.

## Concerns

- Vite reports pre-existing large output chunks during `build:check`; this does not fail the build.
- Rust emits the pre-existing unused `app` warning in `src-tauri/src/lib.rs`.
