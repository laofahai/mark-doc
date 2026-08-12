# Document Workspace Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild MarkDoc's document core around `DocumentWorkspace` and user-visible `.mdoc` packages while preserving plain `.md` as a first-class format and DOCX as an import/export delivery format.

**Architecture:** Introduce a typed document core with importers, exporters, asset management, recovery, package security, and editor adapter boundaries. `.mdoc` is a normal ZIP package identified by `manifest.json` with `format: "markdoc-package"`; the editable source of truth remains clean Markdown plus assets and presentation resources. Existing UI and conversion behavior should be migrated through final interfaces rather than extended through `FileTab.content`.

**Tech Stack:** Tauri v2, Rust, React 19, TypeScript, Vditor, Vitest/jsdom, Pandoc, `@linch-tech/desktop-core`, `zip` crate.

## Global Constraints

- `.mdoc` is the user-visible MarkDoc document format for resource-backed and imported documents.
- Plain `.md` remains a first-class format and must not be silently converted.
- DOCX is an import/export delivery format, not canonical live state.
- Markdown remains the canonical semantic source.
- Base64 is allowed only for clipboard/transient compatibility and migration, not default persistence.
- Save safety priority is: user content is not lost > original file is not corrupted > failure is hidden from the user.
- Remote resources are denied by default and governed by document-level, resource-type-level, and domain/URL exception trust.
- All new user-visible text must use stable i18n keys in both `zh` and `en`.
- Rust/domain services return stable error codes/message keys, not localized prose.
- Vditor must be behind `DocumentEditorAdapter`; the document domain must not depend on Vditor APIs.
- Existing Markdown with local resource references shows a non-blocking `.mdoc` suggestion and still allows in-place `.md` save.
- Imported DOCX `Cmd+S` saves canonical `.mdoc` by default and must not overwrite the original DOCX.

---

## File Structure

Create these focused frontend modules:

```text
src/services/document/
├── errors.ts                 # DocumentError, Result helpers
├── model.ts                  # DocumentModel, DocumentWorkspace, source/storage types
├── workspace-service.ts      # workspace creation and path helpers
├── session-store.ts          # document sessions and dirty/save/external state
├── document-service.ts       # high-level open/save/saveAs/export orchestration
├── save-strategy.ts          # source-specific save behavior
├── recovery-service.ts       # recovery states and save failure semantics
└── external-change-service.ts # external modification conflict decisions

src/services/assets/
└── AssetManager.ts           # asset import, path validation, base64 detection/migration helpers

src/services/importers/
├── MarkdownImporter.ts
├── DocxImporter.ts
└── PackageImporter.ts

src/services/exporters/
├── MarkdownExporter.ts
├── DocxExporter.ts
└── PackageExporter.ts

src/services/presentation/
└── PresentationService.ts

src/services/security/
└── PackageSecurityPolicy.ts

src/components/Editor/
├── editor-adapter.ts
└── VditorEditorAdapter.ts
```

Create these Rust modules:

```text
src-tauri/src/
├── pandoc/
│   ├── mod.rs
│   ├── binary.rs
│   ├── args.rs
│   └── health.rs
├── package/
│   ├── mod.rs
│   ├── manifest.rs
│   ├── validator.rs
│   ├── reader.rs
│   └── writer.rs
└── document/
    ├── mod.rs
    ├── docx_import.rs
    └── docx_export.rs
```

Existing modules to migrate, not expand:

```text
src/contexts/FileContext.tsx       -> replaced by document session context behavior
src/services/file.ts               -> becomes compatibility wrapper or deleted after call sites move
src/services/export-preprocess.ts  -> folded into DocxExporter/AssetManager responsibilities
src-tauri/src/converter.rs         -> split into pandoc/document/package modules
```

---

### Task 1: Error, Result, And i18n Contract

**Files:**
- Create: `src/services/document/errors.ts`
- Create: `src/services/document/__tests__/errors.test.ts`
- Create: `src/locales/__tests__/locale-keys.test.ts`
- Modify: `src/locales/zh.ts`
- Modify: `src/locales/en.ts`

**Interfaces:**
- Produces: `DocumentError`, `Result<T>`, `ok<T>()`, `err()`, `isOk()`, `isErr()`
- Produces locale key domains: `document`, `workspace`, `assets`, `presentation`, `import`, `export`, `package`, `security`, `recovery`, `errors`

- [ ] **Step 1: Write failing tests for Result helpers**

Create `src/services/document/__tests__/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { err, isErr, isOk, ok } from '../errors'

describe('document errors', () => {
  it('creates ok results', () => {
    const result = ok({ id: 'doc-1' })
    expect(isOk(result)).toBe(true)
    expect(isErr(result)).toBe(false)
    if (result.ok) expect(result.value.id).toBe('doc-1')
  })

  it('creates typed document errors with stable keys', () => {
    const result = err('package.invalidManifest', {
      messageKey: 'errors.package.invalidManifest',
      params: { path: 'report.mdoc' },
    })
    expect(isErr(result)).toBe(true)
    if (!result.ok) {
      expect(result.error.code).toBe('package.invalidManifest')
      expect(result.error.messageKey).toBe('errors.package.invalidManifest')
      expect(result.error.params?.path).toBe('report.mdoc')
    }
  })
})
```

- [ ] **Step 2: Write failing locale completeness test**

Create `src/locales/__tests__/locale-keys.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import zh from '../zh'
import en from '../en'

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object') return [prefix]
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key)
  )
}

describe('locale catalogs', () => {
  it('zh and en expose the same keys', () => {
    expect(flattenKeys(zh).sort()).toEqual(flattenKeys(en).sort())
  })

  it('contains document architecture key domains', () => {
    const topLevel = Object.keys(en).sort()
    expect(topLevel).toEqual(expect.arrayContaining([
      'document',
      'workspace',
      'assets',
      'presentation',
      'import',
      'export',
      'package',
      'security',
      'recovery',
      'errors',
    ]))
  })
})
```

- [ ] **Step 3: Run tests to verify failure**

Run: `pnpm test -- src/services/document/__tests__/errors.test.ts src/locales/__tests__/locale-keys.test.ts`

Expected: FAIL because `errors.ts` and new locale domains do not exist.

- [ ] **Step 4: Implement typed errors**

Create `src/services/document/errors.ts`:

```ts
export interface DocumentError {
  code: string
  messageKey: string
  params?: Record<string, string | number | boolean>
  cause?: unknown
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: DocumentError }

export function ok<T>(value: T): Result<T> {
  return { ok: true, value }
}

export function err(
  code: string,
  input?: Partial<Omit<DocumentError, 'code'>>,
): Result<never> {
  return {
    ok: false,
    error: {
      code,
      messageKey: input?.messageKey || `errors.${code}`,
      params: input?.params,
      cause: input?.cause,
    },
  }
}

export function isOk<T>(result: Result<T>): result is { ok: true; value: T } {
  return result.ok
}

export function isErr<T>(result: Result<T>): result is { ok: false; error: DocumentError } {
  return !result.ok
}
```

- [ ] **Step 5: Add required locale domains**

Add these top-level keys to `src/locales/zh.ts`:

```ts
  document: {
    saveAsMarkDoc: '保存为 MarkDoc 文档',
    saveAsMarkdown: '保存为 Markdown',
    suggestPackage: '建议保存为 MarkDoc 文档以便打包资源',
  },
  workspace: {
    recoveryAvailable: '检测到可恢复的文档草稿',
  },
  assets: {
    extractEmbeddedImages: '提取内嵌图片',
    remoteBlocked: '远程资源已被阻止',
  },
  presentation: {
    chineseFormal: '中文正式文档',
    referenceDocx: 'Word 样式模板',
  },
  import: {
    docxAsWorkspace: 'Word 文档已导入为可编辑文档',
  },
  package: {
    invalidManifest: 'MarkDoc 文档清单无效',
    corruptedRecovery: '文档包已损坏，已进入安全恢复模式',
  },
  security: {
    enableRemoteForDocument: '允许此文档加载远程资源',
    enableRemoteImages: '允许远程图片',
    quarantineResource: '此资源已被隔离',
  },
  recovery: {
    retrySave: '重试保存',
    saveAs: '另存为',
    restoreDraft: '恢复草稿',
    discardDraft: '丢弃草稿',
  },
  errors: {
    package: {
      invalidManifest: 'MarkDoc 文档清单无效：{{path}}',
      unsafePath: '文档包包含不安全路径：{{path}}',
    },
    save: {
      failed: '保存失败，但当前内容已保留在恢复草稿中',
    },
  },
```

Add matching keys to `src/locales/en.ts`:

```ts
  document: {
    saveAsMarkDoc: 'Save as MarkDoc document',
    saveAsMarkdown: 'Save as Markdown',
    suggestPackage: 'Save as a MarkDoc document to bundle resources',
  },
  workspace: {
    recoveryAvailable: 'A recoverable document draft was found',
  },
  assets: {
    extractEmbeddedImages: 'Extract embedded images',
    remoteBlocked: 'Remote resource blocked',
  },
  presentation: {
    chineseFormal: 'Chinese Formal Document',
    referenceDocx: 'Word style template',
  },
  import: {
    docxAsWorkspace: 'Word document imported as an editable document',
  },
  package: {
    invalidManifest: 'Invalid MarkDoc document manifest',
    corruptedRecovery: 'The document package is corrupted; safe recovery mode is active',
  },
  security: {
    enableRemoteForDocument: 'Allow this document to load remote resources',
    enableRemoteImages: 'Allow remote images',
    quarantineResource: 'This resource has been quarantined',
  },
  recovery: {
    retrySave: 'Retry save',
    saveAs: 'Save as',
    restoreDraft: 'Restore draft',
    discardDraft: 'Discard draft',
  },
  errors: {
    package: {
      invalidManifest: 'Invalid MarkDoc document manifest: {{path}}',
      unsafePath: 'Document package contains an unsafe path: {{path}}',
    },
    save: {
      failed: 'Save failed, but current content is preserved in a recovery draft',
    },
  },
```

- [ ] **Step 6: Run tests**

Run: `pnpm test -- src/services/document/__tests__/errors.test.ts src/locales/__tests__/locale-keys.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/document/errors.ts src/services/document/__tests__/errors.test.ts src/locales/__tests__/locale-keys.test.ts src/locales/zh.ts src/locales/en.ts
git commit -m "feat: add document error and i18n contracts"
```

---

### Task 2: Document Model And Workspace Service

**Files:**
- Create: `src/services/document/model.ts`
- Create: `src/services/document/workspace-service.ts`
- Create: `src/services/document/__tests__/workspace-service.test.ts`

**Interfaces:**
- Consumes: `Result`, `ok`, `err` from `src/services/document/errors.ts`
- Produces: `DocumentModel`, `DocumentWorkspace`, `DocumentSource`, `WorkspaceStorage`, `createMarkdownWorkspace()`, `createTemporaryWorkspace()`, `resolveWorkspacePath()`, `isRelativeWorkspacePath()`

- [ ] **Step 1: Write failing workspace tests**

Create `src/services/document/__tests__/workspace-service.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createMarkdownWorkspace, createTemporaryWorkspace, isRelativeWorkspacePath, resolveWorkspacePath } from '../workspace-service'

describe('WorkspaceService', () => {
  it('creates virtual workspaces for plain markdown without manifest or assets paths', () => {
    const workspace = createMarkdownWorkspace('/docs/report.md')
    expect(workspace.storage.type).toBe('virtual-markdown')
    expect(workspace.entryPath).toBe('/docs/report.md')
    expect(workspace.rootPath).toBe('/docs')
    expect(workspace.manifestPath).toBeUndefined()
    expect(workspace.assetsPath).toBeUndefined()
  })

  it('creates temporary workspaces with recovery keys', () => {
    const workspace = createTemporaryWorkspace('/tmp/markdoc/doc-1', 'docx-import')
    expect(workspace.storage).toEqual({
      type: 'temporary',
      rootPath: '/tmp/markdoc/doc-1',
      recoveryKey: 'docx-import',
    })
    expect(workspace.entryPath).toBe('/tmp/markdoc/doc-1/document.md')
    expect(workspace.assetsPath).toBe('/tmp/markdoc/doc-1/assets')
  })

  it('rejects absolute and traversal workspace-relative paths', () => {
    expect(isRelativeWorkspacePath('assets/a.png')).toBe(true)
    expect(isRelativeWorkspacePath('../secret.txt')).toBe(false)
    expect(isRelativeWorkspacePath('/tmp/secret.txt')).toBe(false)
    expect(isRelativeWorkspacePath('C:\\\\secret.txt')).toBe(false)
  })

  it('resolves safe relative paths under root', () => {
    const workspace = createTemporaryWorkspace('/tmp/markdoc/doc-1', 'package')
    const result = resolveWorkspacePath(workspace, 'assets/a.png')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe('/tmp/markdoc/doc-1/assets/a.png')
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test -- src/services/document/__tests__/workspace-service.test.ts`

Expected: FAIL because workspace modules do not exist.

- [ ] **Step 3: Implement document model**

Create `src/services/document/model.ts`:

```ts
export type DocumentSource =
  | { type: 'markdown'; path: string }
  | { type: 'directory'; rootPath: string; entryPath: string }
  | { type: 'package'; packagePath: string; extractedWorkspacePath: string }
  | { type: 'docx'; originalPath: string; workspacePath: string }
  | { type: 'new' }

export type WorkspaceStorage =
  | { type: 'virtual-markdown'; markdownPath: string }
  | { type: 'directory'; rootPath: string }
  | { type: 'temporary'; rootPath: string; recoveryKey: string }

export interface DocumentWorkspace {
  id: string
  rootPath?: string
  entryPath: string
  assetsPath?: string
  presentationPath?: string
  manifestPath?: string
  storage: WorkspaceStorage
}

export interface PresentationConfig {
  profile?: string
  screen?: string
  print?: string
  docx?: {
    referenceDocx?: string
  }
}

export interface DocumentMetadata {
  title?: string
  lang?: string
  frontmatter?: Record<string, unknown>
}

export interface AssetRegistry {
  references: string[]
}

export interface DocumentDirtyState {
  markdown: boolean
  assets: boolean
  presentation: boolean
}

export interface DocumentModel {
  id: string
  source: DocumentSource
  workspace: DocumentWorkspace
  markdown: string
  metadata: DocumentMetadata
  assets: AssetRegistry
  presentation: PresentationConfig
  dirty: DocumentDirtyState
}
```

- [ ] **Step 4: Implement workspace service**

Create `src/services/document/workspace-service.ts`:

```ts
import { err, ok, type Result } from './errors'
import type { DocumentWorkspace } from './model'

let workspaceCounter = 0

function nextWorkspaceId() {
  workspaceCounter += 1
  return `workspace-${workspaceCounter}`
}

function parentDir(path: string) {
  const normalized = path.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')
  return index >= 0 ? normalized.slice(0, index) || '/' : ''
}

function joinPath(...parts: string[]) {
  return parts
    .join('/')
    .replace(/\/+/g, '/')
    .replace(/^([A-Za-z]):\//, '$1:/')
}

export function isRelativeWorkspacePath(path: string) {
  const normalized = path.replace(/\\/g, '/')
  return Boolean(normalized)
    && !normalized.startsWith('/')
    && !/^[A-Za-z]:\//.test(normalized)
    && !normalized.split('/').includes('..')
}

export function createMarkdownWorkspace(markdownPath: string): DocumentWorkspace {
  return {
    id: nextWorkspaceId(),
    rootPath: parentDir(markdownPath),
    entryPath: markdownPath,
    storage: { type: 'virtual-markdown', markdownPath },
  }
}

export function createTemporaryWorkspace(rootPath: string, recoveryKey: string): DocumentWorkspace {
  return {
    id: nextWorkspaceId(),
    rootPath,
    entryPath: joinPath(rootPath, 'document.md'),
    assetsPath: joinPath(rootPath, 'assets'),
    presentationPath: joinPath(rootPath, 'presentation'),
    manifestPath: joinPath(rootPath, 'manifest.json'),
    storage: { type: 'temporary', rootPath, recoveryKey },
  }
}

export function resolveWorkspacePath(workspace: DocumentWorkspace, relativePath: string): Result<string> {
  if (!workspace.rootPath) {
    return err('workspace.noRoot', { messageKey: 'errors.workspace.noRoot' })
  }
  if (!isRelativeWorkspacePath(relativePath)) {
    return err('workspace.unsafePath', {
      messageKey: 'errors.package.unsafePath',
      params: { path: relativePath },
    })
  }
  return ok(joinPath(workspace.rootPath, relativePath))
}
```

- [ ] **Step 5: Add missing error locale keys**

Add `errors.workspace.noRoot` to both locale files:

```ts
workspace: {
  noRoot: 'Workspace has no filesystem root',
},
```

Use Chinese copy in `zh.ts`:

```ts
workspace: {
  noRoot: '文档工作区没有文件系统根目录',
},
```

- [ ] **Step 6: Run tests**

Run: `pnpm test -- src/services/document/__tests__/workspace-service.test.ts src/locales/__tests__/locale-keys.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/document/model.ts src/services/document/workspace-service.ts src/services/document/__tests__/workspace-service.test.ts src/locales/zh.ts src/locales/en.ts
git commit -m "feat: add document workspace model"
```

---

### Task 3: Asset Manager And Source Quality Guards

**Files:**
- Create: `src/services/assets/AssetManager.ts`
- Create: `src/services/assets/__tests__/AssetManager.test.ts`
- Modify: `src/test/setup.ts`

**Interfaces:**
- Consumes: `DocumentWorkspace`, `resolveWorkspacePath()`
- Produces: `AssetManager`, `findLocalAssetReferences()`, `containsBase64Images()`, `rewriteBase64ImageReferences()`

- [ ] **Step 1: Extend Tauri FS test mocks**

Modify `src/test/setup.ts`:

```ts
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  writeFile: vi.fn(),
  readFile: vi.fn(),
  mkdir: vi.fn(),
  remove: vi.fn(),
  watch: vi.fn(),
}))
```

- [ ] **Step 2: Write failing asset tests**

Create `src/services/assets/__tests__/AssetManager.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { writeFile } from '@tauri-apps/plugin-fs'
import { createTemporaryWorkspace } from '../../document/workspace-service'
import { AssetManager, containsBase64Images, findLocalAssetReferences } from '../AssetManager'

describe('AssetManager', () => {
  beforeEach(() => vi.clearAllMocks())

  it('detects local asset references without treating remote URLs as local assets', () => {
    const markdown = [
      '![local](assets/a.png)',
      '![remote](https://example.com/a.png)',
      '<img src="images/b.jpg" alt="b">',
    ].join('\n')
    expect(findLocalAssetReferences(markdown)).toEqual(['assets/a.png', 'images/b.jpg'])
  })

  it('detects base64 image persistence', () => {
    expect(containsBase64Images('![x](data:image/png;base64,AAAA)')).toBe(true)
    expect(containsBase64Images('![x](assets/a.png)')).toBe(false)
  })

  it('imports bytes into workspace assets using relative markdown paths', async () => {
    const workspace = createTemporaryWorkspace('/tmp/markdoc/doc-1', 'test')
    const manager = new AssetManager(workspace)
    const result = await manager.importBytes(new Uint8Array([1, 2, 3]), {
      preferredName: 'Screenshot 1.png',
      mimeType: 'image/png',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.markdownPath).toMatch(/^assets\/screenshot-1-[a-f0-9]{8}\.png$/)
    }
    expect(writeFile).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 3: Run tests to verify failure**

Run: `pnpm test -- src/services/assets/__tests__/AssetManager.test.ts`

Expected: FAIL because `AssetManager` does not exist and FS mocks lack new functions before Step 1.

- [ ] **Step 4: Implement AssetManager**

Create `src/services/assets/AssetManager.ts`:

```ts
import { writeFile } from '@tauri-apps/plugin-fs'
import { err, ok, type Result } from '../document/errors'
import type { DocumentWorkspace } from '../document/model'
import { resolveWorkspacePath } from '../document/workspace-service'

export interface AssetRef {
  markdownPath: string
  absolutePath: string
  kind: 'image' | 'attachment' | 'data' | 'other'
  mimeType?: string
}

interface ImportBytesOptions {
  preferredName: string
  mimeType?: string
}

const MD_IMAGE_RE = /!\[[^\]]*\]\(([^)]+)\)/g
const HTML_IMG_RE = /<img\s[^>]*src=["']([^"']+)["'][^>]*>/g
const BASE64_IMAGE_RE = /data:image\/[a-zA-Z0-9.+-]+;base64,/i

function isRemoteOrData(path: string) {
  return /^(https?:|data:|file:)/i.test(path)
}

function slugifyName(name: string) {
  const dot = name.lastIndexOf('.')
  const base = dot >= 0 ? name.slice(0, dot) : name
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : 'bin'
  const slug = base
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'asset'
  return { slug, ext }
}

function shortHash(bytes: Uint8Array) {
  let hash = 2166136261
  for (const byte of bytes) {
    hash ^= byte
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function containsBase64Images(markdown: string) {
  return BASE64_IMAGE_RE.test(markdown)
}

export function findLocalAssetReferences(markdown: string) {
  const refs = new Set<string>()
  for (const re of [new RegExp(MD_IMAGE_RE), new RegExp(HTML_IMG_RE)]) {
    let match: RegExpExecArray | null
    while ((match = re.exec(markdown)) !== null) {
      const path = match[1].trim()
      if (path && !isRemoteOrData(path)) refs.add(path)
    }
  }
  return [...refs]
}

export class AssetManager {
  constructor(private workspace: DocumentWorkspace) {}

  async importBytes(bytes: Uint8Array, options: ImportBytesOptions): Promise<Result<AssetRef>> {
    const { slug, ext } = slugifyName(options.preferredName)
    const markdownPath = `assets/${slug}-${shortHash(bytes)}.${ext}`
    const resolved = resolveWorkspacePath(this.workspace, markdownPath)
    if (!resolved.ok) return resolved
    await writeFile(resolved.value, bytes)
    return ok({
      markdownPath,
      absolutePath: resolved.value,
      kind: options.mimeType?.startsWith('image/') ? 'image' : 'attachment',
      mimeType: options.mimeType,
    })
  }
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm test -- src/services/assets/__tests__/AssetManager.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/test/setup.ts src/services/assets/AssetManager.ts src/services/assets/__tests__/AssetManager.test.ts
git commit -m "feat: add asset manager source quality guards"
```

---

### Task 4: Package Manifest, Validation, Reader, And Writer In Rust

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/package/mod.rs`
- Create: `src-tauri/src/package/manifest.rs`
- Create: `src-tauri/src/package/validator.rs`
- Create: `src-tauri/src/package/reader.rs`
- Create: `src-tauri/src/package/writer.rs`

**Interfaces:**
- Produces Tauri commands: `read_mdoc_package(package_path: String) -> Result<PackageReadResult, String>`, `write_mdoc_package(input: PackageWriteInput) -> Result<PackageWriteResult, String>`
- Produces Rust types: `MarkDocManifest`, `PackageReadResult`, `PackageWriteInput`, `PackageWriteResult`

- [ ] **Step 1: Add Rust test dependencies**

Modify `src-tauri/Cargo.toml`:

```toml
[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 2: Write failing validator tests**

Create `src-tauri/src/package/validator.rs`:

```rust
use std::path::{Component, Path};

pub fn is_safe_package_path(path: &str) -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_relative_package_paths() {
        assert!(is_safe_package_path("document.md"));
        assert!(is_safe_package_path("assets/image.png"));
        assert!(is_safe_package_path("presentation/reference.docx"));
    }

    #[test]
    fn rejects_traversal_absolute_and_drive_paths() {
        assert!(!is_safe_package_path("../secret.txt"));
        assert!(!is_safe_package_path("/tmp/secret.txt"));
        assert!(!is_safe_package_path("C:\\\\secret.txt"));
        assert!(!is_safe_package_path("assets/../../secret.txt"));
    }
}
```

- [ ] **Step 3: Run Rust tests to verify failure**

Run: `cd src-tauri && cargo test package::validator`

Expected: FAIL because `is_safe_package_path("document.md")` returns false and package module is not wired.

- [ ] **Step 4: Wire package module**

Create `src-tauri/src/package/mod.rs`:

```rust
pub mod manifest;
pub mod reader;
pub mod validator;
pub mod writer;

pub use reader::{read_mdoc_package, PackageReadResult};
pub use writer::{write_mdoc_package, PackageWriteInput, PackageWriteResult};
```

Modify `src-tauri/src/lib.rs`:

```rust
mod package;
```

Add commands to `invoke_handler`:

```rust
package::read_mdoc_package,
package::write_mdoc_package,
```

- [ ] **Step 5: Implement safe path validation**

Replace `src-tauri/src/package/validator.rs` with:

```rust
use std::path::{Component, Path};

pub fn is_safe_package_path(path: &str) -> bool {
    if path.trim().is_empty() || path.contains('\\') {
        return false;
    }

    let path = Path::new(path);
    if path.is_absolute() {
        return false;
    }

    for component in path.components() {
        match component {
            Component::Normal(_) => {}
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => return false,
        }
    }

    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_relative_package_paths() {
        assert!(is_safe_package_path("document.md"));
        assert!(is_safe_package_path("assets/image.png"));
        assert!(is_safe_package_path("presentation/reference.docx"));
    }

    #[test]
    fn rejects_traversal_absolute_and_drive_paths() {
        assert!(!is_safe_package_path("../secret.txt"));
        assert!(!is_safe_package_path("/tmp/secret.txt"));
        assert!(!is_safe_package_path("C:\\\\secret.txt"));
        assert!(!is_safe_package_path("assets/../../secret.txt"));
    }
}
```

- [ ] **Step 6: Implement manifest types**

Create `src-tauri/src/package/manifest.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MarkDocManifest {
    pub format: String,
    pub version: u32,
    pub entry: String,
    #[serde(default)]
    pub presentation: Option<ManifestPresentation>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ManifestPresentation {
    #[serde(default)]
    pub print: Option<String>,
    #[serde(rename = "docxReference", default)]
    pub docx_reference: Option<String>,
}

impl MarkDocManifest {
    pub fn new(entry: impl Into<String>) -> Self {
        Self {
            format: "markdoc-package".to_string(),
            version: 1,
            entry: entry.into(),
            presentation: None,
        }
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.format != "markdoc-package" {
            return Err("package.invalidManifest".to_string());
        }
        if self.version != 1 {
            return Err("package.unsupportedVersion".to_string());
        }
        if !crate::package::validator::is_safe_package_path(&self.entry) {
            return Err("package.unsafePath".to_string());
        }
        Ok(())
    }
}
```

- [ ] **Step 7: Implement writer with atomic replacement**

Create `src-tauri/src/package/writer.rs`:

```rust
use super::manifest::MarkDocManifest;
use super::validator::is_safe_package_path;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageWriteInput {
    pub workspace_root: String,
    pub output_path: String,
    pub entry: String,
    #[serde(default)]
    pub files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageWriteResult {
    pub output_path: String,
    pub recovery_path: Option<String>,
}

#[tauri::command]
pub fn write_mdoc_package(input: PackageWriteInput) -> Result<PackageWriteResult, String> {
    let workspace_root = PathBuf::from(&input.workspace_root);
    let output_path = PathBuf::from(&input.output_path);
    let tmp_path = output_path.with_extension("mdoc.tmp");
    let recovery_path = output_path.with_extension("mdoc.bak");

    let manifest = MarkDocManifest::new(&input.entry);
    manifest.validate()?;

    let file = File::create(&tmp_path).map_err(|_| "save.failed".to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default();

    let manifest_json = serde_json::to_vec_pretty(&manifest).map_err(|_| "package.invalidManifest".to_string())?;
    zip.start_file("manifest.json", options).map_err(|_| "save.failed".to_string())?;
    zip.write_all(&manifest_json).map_err(|_| "save.failed".to_string())?;

    for package_path in input.files {
        if !is_safe_package_path(&package_path) {
            return Err("package.unsafePath".to_string());
        }
        let absolute_path = workspace_root.join(&package_path);
        let mut bytes = Vec::new();
        File::open(&absolute_path)
            .map_err(|_| "package.missingEntry".to_string())?
            .read_to_end(&mut bytes)
            .map_err(|_| "package.readFailed".to_string())?;
        zip.start_file(package_path, options).map_err(|_| "save.failed".to_string())?;
        zip.write_all(&bytes).map_err(|_| "save.failed".to_string())?;
    }

    zip.finish().map_err(|_| "save.failed".to_string())?;

    if output_path.exists() {
        fs::copy(&output_path, &recovery_path).map_err(|_| "save.recoveryFailed".to_string())?;
    }

    fs::rename(&tmp_path, &output_path).map_err(|_| "save.failed".to_string())?;

    Ok(PackageWriteResult {
        output_path: input.output_path,
        recovery_path: output_path.with_extension("mdoc.bak").to_str().map(|s| s.to_string()),
    })
}
```

- [ ] **Step 8: Implement reader with manifest validation**

Create `src-tauri/src/package/reader.rs`:

```rust
use super::manifest::MarkDocManifest;
use super::validator::is_safe_package_path;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Read;
use zip::ZipArchive;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageReadResult {
    pub manifest: MarkDocManifest,
    pub entries: Vec<String>,
    pub quarantined: Vec<String>,
}

#[tauri::command]
pub fn read_mdoc_package(package_path: String) -> Result<PackageReadResult, String> {
    let file = File::open(package_path).map_err(|_| "package.openFailed".to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|_| "package.corrupted".to_string())?;

    let mut manifest_json = String::new();
    archive
        .by_name("manifest.json")
        .map_err(|_| "package.invalidManifest".to_string())?
        .read_to_string(&mut manifest_json)
        .map_err(|_| "package.invalidManifest".to_string())?;

    let manifest: MarkDocManifest =
        serde_json::from_str(&manifest_json).map_err(|_| "package.invalidManifest".to_string())?;
    manifest.validate()?;

    let mut entries = Vec::new();
    let mut quarantined = Vec::new();
    for i in 0..archive.len() {
        let entry = archive.by_index(i).map_err(|_| "package.corrupted".to_string())?;
        let name = entry.name().to_string();
        if name == "manifest.json" {
            continue;
        }
        if !is_safe_package_path(&name) || should_quarantine(&name) {
            quarantined.push(name);
        } else {
            entries.push(name);
        }
    }

    Ok(PackageReadResult { manifest, entries, quarantined })
}

fn should_quarantine(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with(".css") || lower.ends_with(".svg") || lower.ends_with(".docx")
}
```

- [ ] **Step 9: Add reader/writer tests**

Append tests to `src-tauri/src/package/writer.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn writes_manifest_and_entry() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("workspace");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("document.md"), "# Hello").unwrap();
        let output = dir.path().join("report.mdoc");

        let result = write_mdoc_package(PackageWriteInput {
            workspace_root: root.to_string_lossy().to_string(),
            output_path: output.to_string_lossy().to_string(),
            entry: "document.md".to_string(),
            files: vec!["document.md".to_string()],
        }).unwrap();

        assert!(output.exists());
        assert_eq!(result.output_path, output.to_string_lossy());
    }
}
```

- [ ] **Step 10: Run Rust tests**

Run: `cd src-tauri && cargo test package`

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/src/package
git commit -m "feat: add mdoc package reader writer"
```

---

### Task 5: Frontend Package Security Policy And Import/Export Wrappers

**Files:**
- Create: `src/services/security/PackageSecurityPolicy.ts`
- Create: `src/services/security/__tests__/PackageSecurityPolicy.test.ts`
- Create: `src/services/importers/PackageImporter.ts`
- Create: `src/services/exporters/PackageExporter.ts`
- Create: `src/services/package/__tests__/package-import-export.test.ts`

**Interfaces:**
- Consumes: Rust commands `read_mdoc_package`, `write_mdoc_package`
- Produces: `PackageSecurityPolicy`, `PackageImporter`, `PackageExporter`

- [ ] **Step 1: Write failing security policy tests**

Create `src/services/security/__tests__/PackageSecurityPolicy.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { PackageSecurityPolicy } from '../PackageSecurityPolicy'

describe('PackageSecurityPolicy', () => {
  it('denies remote resources by default', () => {
    const policy = PackageSecurityPolicy.default()
    expect(policy.canLoadRemote('https://example.com/image.png', 'image')).toBe(false)
  })

  it('allows resource type trust without allowing every type', () => {
    const policy = PackageSecurityPolicy.default().allowResourceType('image')
    expect(policy.canLoadRemote('https://example.com/image.png', 'image')).toBe(true)
    expect(policy.canLoadRemote('https://example.com/style.css', 'style')).toBe(false)
  })

  it('allows domain exceptions', () => {
    const policy = PackageSecurityPolicy.default().allowDomain('images.example.com')
    expect(policy.canLoadRemote('https://images.example.com/a.png', 'image')).toBe(true)
    expect(policy.canLoadRemote('https://other.example.com/a.png', 'image')).toBe(false)
  })
})
```

- [ ] **Step 2: Write failing package wrapper tests**

Create `src/services/package/__tests__/package-import-export.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { PackageImporter } from '../../importers/PackageImporter'
import { PackageExporter } from '../../exporters/PackageExporter'
import { createTemporaryWorkspace } from '../../document/workspace-service'

describe('package import/export wrappers', () => {
  it('imports only manifest-identified mdoc packages', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      manifest: { format: 'markdoc-package', version: 1, entry: 'document.md' },
      entries: ['document.md', 'assets/a.png'],
      quarantined: ['presentation/print.css'],
    })
    const importer = new PackageImporter()
    const result = await importer.inspect('/docs/report.mdoc')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.manifest.entry).toBe('document.md')
      expect(result.value.quarantined).toEqual(['presentation/print.css'])
    }
  })

  it('exports workspace through write_mdoc_package command', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ outputPath: '/docs/report.mdoc', recoveryPath: null })
    const exporter = new PackageExporter()
    const workspace = createTemporaryWorkspace('/tmp/markdoc/doc-1', 'test')
    const result = await exporter.export(workspace, {
      outputPath: '/docs/report.mdoc',
      files: ['document.md', 'assets/a.png'],
    })
    expect(result.ok).toBe(true)
    expect(invoke).toHaveBeenCalledWith('write_mdoc_package', {
      input: {
        workspaceRoot: '/tmp/markdoc/doc-1',
        outputPath: '/docs/report.mdoc',
        entry: 'document.md',
        files: ['document.md', 'assets/a.png'],
      },
    })
  })
})
```

- [ ] **Step 3: Run tests to verify failure**

Run: `pnpm test -- src/services/security/__tests__/PackageSecurityPolicy.test.ts src/services/package/__tests__/package-import-export.test.ts`

Expected: FAIL because modules do not exist.

- [ ] **Step 4: Implement `PackageSecurityPolicy`**

Create `src/services/security/PackageSecurityPolicy.ts`:

```ts
type RemoteResourceType = 'image' | 'style' | 'font' | 'script' | 'other'

export class PackageSecurityPolicy {
  private constructor(
    private documentTrusted: boolean,
    private trustedTypes: Set<RemoteResourceType>,
    private trustedDomains: Set<string>,
  ) {}

  static default() {
    return new PackageSecurityPolicy(false, new Set(), new Set())
  }

  trustDocument() {
    return new PackageSecurityPolicy(true, new Set(this.trustedTypes), new Set(this.trustedDomains))
  }

  allowResourceType(type: RemoteResourceType) {
    return new PackageSecurityPolicy(this.documentTrusted, new Set([...this.trustedTypes, type]), new Set(this.trustedDomains))
  }

  allowDomain(domain: string) {
    return new PackageSecurityPolicy(this.documentTrusted, new Set(this.trustedTypes), new Set([...this.trustedDomains, domain]))
  }

  canLoadRemote(url: string, type: RemoteResourceType) {
    if (this.documentTrusted) return true
    const host = safeHost(url)
    if (!host) return false
    return this.trustedTypes.has(type) || this.trustedDomains.has(host)
  }
}

function safeHost(url: string) {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}
```

- [ ] **Step 5: Implement package wrappers**

Create `src/services/importers/PackageImporter.ts`:

```ts
import { invoke } from '@tauri-apps/api/core'
import { err, ok, type Result } from '../document/errors'

export interface PackageManifest {
  format: 'markdoc-package'
  version: number
  entry: string
}

interface PackageInspectResult {
  manifest: PackageManifest
  entries: string[]
  quarantined: string[]
}

export class PackageImporter {
  async inspect(path: string): Promise<Result<PackageInspectResult>> {
    try {
      const result = await invoke<PackageInspectResult>('read_mdoc_package', { packagePath: path })
      if (result.manifest.format !== 'markdoc-package') {
        return err('package.invalidManifest', { messageKey: 'errors.package.invalidManifest', params: { path } })
      }
      return ok(result)
    } catch (cause) {
      return err('package.openFailed', { messageKey: 'errors.package.invalidManifest', params: { path }, cause })
    }
  }
}
```

Create `src/services/exporters/PackageExporter.ts`:

```ts
import { invoke } from '@tauri-apps/api/core'
import { err, ok, type Result } from '../document/errors'
import type { DocumentWorkspace } from '../document/model'

interface PackageExportOptions {
  outputPath: string
  files: string[]
}

interface PackageExportResult {
  outputPath: string
  recoveryPath?: string | null
}

export class PackageExporter {
  async export(workspace: DocumentWorkspace, options: PackageExportOptions): Promise<Result<PackageExportResult>> {
    if (!workspace.rootPath) {
      return err('workspace.noRoot', { messageKey: 'errors.workspace.noRoot' })
    }
    try {
      const result = await invoke<PackageExportResult>('write_mdoc_package', {
        input: {
          workspaceRoot: workspace.rootPath,
          outputPath: options.outputPath,
          entry: 'document.md',
          files: options.files,
        },
      })
      return ok(result)
    } catch (cause) {
      return err('save.failed', { messageKey: 'errors.save.failed', cause })
    }
  }
}
```

- [ ] **Step 6: Run tests**

Run: `pnpm test -- src/services/security/__tests__/PackageSecurityPolicy.test.ts src/services/package/__tests__/package-import-export.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/security src/services/importers/PackageImporter.ts src/services/exporters/PackageExporter.ts src/services/package
git commit -m "feat: add mdoc frontend import export wrappers"
```

---

### Task 6: Document Session Store, Save Strategy, And Recovery

**Files:**
- Create: `src/services/document/session-store.ts`
- Create: `src/services/document/save-strategy.ts`
- Create: `src/services/document/recovery-service.ts`
- Create: `src/services/document/external-change-service.ts`
- Create: `src/services/document/__tests__/session-save-recovery.test.ts`

**Interfaces:**
- Consumes: `DocumentModel`, `PackageExporter`
- Produces: `DocumentSessionStore`, `resolveSaveTarget()`, `RecoveryService`, `resolveExternalConflict()`

- [ ] **Step 1: Write failing session/save tests**

Create `src/services/document/__tests__/session-save-recovery.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { DocumentModel } from '../model'
import { DocumentSessionStore } from '../session-store'
import { RecoveryService } from '../recovery-service'
import { resolveExternalConflict, resolveSaveTarget } from '../save-strategy'

function model(source: DocumentModel['source']): DocumentModel {
  return {
    id: 'doc-1',
    source,
    workspace: {
      id: 'workspace-1',
      rootPath: '/tmp/doc-1',
      entryPath: '/tmp/doc-1/document.md',
      storage: { type: 'temporary', rootPath: '/tmp/doc-1', recoveryKey: 'test' },
    },
    markdown: '# Hello',
    metadata: {},
    assets: { references: [] },
    presentation: {},
    dirty: { markdown: false, assets: false, presentation: false },
  }
}

describe('document session and save strategy', () => {
  it('defaults new documents to mdoc while allowing markdown', () => {
    expect(resolveSaveTarget(model({ type: 'new' }))).toEqual({
      defaultKind: 'mdoc',
      allowedKinds: ['mdoc', 'markdown'],
      requiresDialog: true,
    })
  })

  it('does not overwrite imported docx on primary save', () => {
    expect(resolveSaveTarget(model({ type: 'docx', originalPath: '/docs/a.docx', workspacePath: '/tmp/doc' }))).toMatchObject({
      defaultKind: 'mdoc',
      disallowOverwriteOriginal: true,
    })
  })

  it('keeps markdown in-place unless newly imported assets require save as', () => {
    expect(resolveSaveTarget(model({ type: 'markdown', path: '/docs/a.md' }))).toMatchObject({
      defaultKind: 'markdown',
      requiresDialog: false,
    })
    const withAssets = model({ type: 'markdown', path: '/docs/a.md' })
    withAssets.dirty.assets = true
    expect(resolveSaveTarget(withAssets)).toMatchObject({
      defaultKind: 'mdoc',
      requiresDialog: true,
    })
  })

  it('keeps dirty mdoc external conflicts out of automatic merge', () => {
    expect(resolveExternalConflict({ dirty: true, sourceType: 'package' })).toEqual({
      autoMerge: false,
      actions: ['keepCurrent', 'saveAs', 'discardAndReload'],
    })
  })

  it('records recovery states that preserve content before hiding failures', () => {
    const recovery = new RecoveryService()
    const state = recovery.recordSaveFailure('doc-1', {
      draftPath: '/tmp/recovery/doc-1/document.md',
      originalUnchanged: true,
      reason: 'cloud-lock',
    })
    expect(state.priority).toEqual(['content-preserved', 'original-unchanged', 'user-visible'])
  })

  it('stores sessions by document id', () => {
    const store = new DocumentSessionStore()
    store.add(model({ type: 'new' }))
    expect(store.get('doc-1')?.document.markdown).toBe('# Hello')
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test -- src/services/document/__tests__/session-save-recovery.test.ts`

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement session store**

Create `src/services/document/session-store.ts`:

```ts
import type { DocumentModel } from './model'

export interface DocumentSession {
  document: DocumentModel
  saveState: 'clean' | 'dirty' | 'saving' | 'recovery'
  externalState: 'current' | 'modified-externally'
}

export class DocumentSessionStore {
  private sessions = new Map<string, DocumentSession>()

  add(document: DocumentModel) {
    this.sessions.set(document.id, {
      document,
      saveState: 'clean',
      externalState: 'current',
    })
  }

  get(documentId: string) {
    return this.sessions.get(documentId)
  }

  update(documentId: string, update: Partial<DocumentSession>) {
    const current = this.sessions.get(documentId)
    if (!current) return
    this.sessions.set(documentId, { ...current, ...update })
  }

  all() {
    return [...this.sessions.values()]
  }
}
```

- [ ] **Step 4: Implement save and conflict strategy**

Create `src/services/document/save-strategy.ts`:

```ts
import type { DocumentModel } from './model'

export type SaveKind = 'mdoc' | 'markdown' | 'docx'

export interface SaveTargetDecision {
  defaultKind: SaveKind
  allowedKinds: SaveKind[]
  requiresDialog: boolean
  disallowOverwriteOriginal?: boolean
}

export function resolveSaveTarget(document: DocumentModel): SaveTargetDecision {
  if (document.source.type === 'new') {
    return { defaultKind: 'mdoc', allowedKinds: ['mdoc', 'markdown'], requiresDialog: true }
  }
  if (document.source.type === 'docx') {
    return {
      defaultKind: 'mdoc',
      allowedKinds: ['mdoc', 'markdown'],
      requiresDialog: true,
      disallowOverwriteOriginal: true,
    }
  }
  if (document.source.type === 'markdown') {
    return document.dirty.assets || document.dirty.presentation
      ? { defaultKind: 'mdoc', allowedKinds: ['mdoc', 'markdown'], requiresDialog: true }
      : { defaultKind: 'markdown', allowedKinds: ['markdown', 'mdoc'], requiresDialog: false }
  }
  if (document.source.type === 'package') {
    return { defaultKind: 'mdoc', allowedKinds: ['mdoc'], requiresDialog: false }
  }
  return { defaultKind: 'mdoc', allowedKinds: ['mdoc', 'markdown'], requiresDialog: true }
}

export function resolveExternalConflict(input: { dirty: boolean; sourceType: 'package' | 'markdown' | 'directory' }) {
  if (input.dirty) {
    return {
      autoMerge: false,
      actions: ['keepCurrent', 'saveAs', 'discardAndReload'] as const,
    }
  }
  return {
    autoMerge: false,
    actions: ['reload'] as const,
  }
}
```

- [ ] **Step 5: Implement recovery service**

Create `src/services/document/recovery-service.ts`:

```ts
export interface SaveFailureInput {
  draftPath: string
  originalUnchanged: boolean
  reason: 'disk-full' | 'permission' | 'cloud-lock' | 'version-conflict' | 'interrupted' | 'unknown'
}

export interface RecoveryState extends SaveFailureInput {
  documentId: string
  priority: ['content-preserved', 'original-unchanged', 'user-visible']
}

export class RecoveryService {
  private states = new Map<string, RecoveryState>()

  recordSaveFailure(documentId: string, input: SaveFailureInput): RecoveryState {
    const state: RecoveryState = {
      documentId,
      ...input,
      priority: ['content-preserved', 'original-unchanged', 'user-visible'],
    }
    this.states.set(documentId, state)
    return state
  }

  get(documentId: string) {
    return this.states.get(documentId)
  }

  clear(documentId: string) {
    this.states.delete(documentId)
  }
}
```

Create `src/services/document/external-change-service.ts`:

```ts
export { resolveExternalConflict } from './save-strategy'
```

- [ ] **Step 6: Run tests**

Run: `pnpm test -- src/services/document/__tests__/session-save-recovery.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/document/session-store.ts src/services/document/save-strategy.ts src/services/document/recovery-service.ts src/services/document/external-change-service.ts src/services/document/__tests__/session-save-recovery.test.ts
git commit -m "feat: add document session save recovery strategy"
```

---

### Task 7: Markdown Importer, Document Service, And Plain Markdown Compatibility

**Files:**
- Create: `src/services/importers/MarkdownImporter.ts`
- Create: `src/services/document/document-service.ts`
- Create: `src/services/document/__tests__/document-service-markdown.test.ts`

**Interfaces:**
- Consumes: `DocumentSessionStore`, `createMarkdownWorkspace()`, `findLocalAssetReferences()`
- Produces: `MarkdownImporter.import(path, markdown)`, `DocumentService.openMarkdown()`

- [ ] **Step 1: Write failing tests**

Create `src/services/document/__tests__/document-service-markdown.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DocumentService } from '../document-service'

describe('DocumentService markdown flow', () => {
  it('opens plain markdown without package metadata', async () => {
    const service = new DocumentService()
    const result = await service.openMarkdown('/docs/readme.md', '# Readme')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.document.source).toEqual({ type: 'markdown', path: '/docs/readme.md' })
      expect(result.value.document.workspace.manifestPath).toBeUndefined()
      expect(result.value.document.markdown).toBe('# Readme')
    }
  })

  it('flags local resource references for non-blocking mdoc suggestion', async () => {
    const service = new DocumentService()
    const result = await service.openMarkdown('/docs/report.md', '![x](images/a.png)')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.resourceSuggestion).toEqual({
        kind: 'suggest-mdoc',
        references: ['images/a.png'],
      })
    }
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test -- src/services/document/__tests__/document-service-markdown.test.ts`

Expected: FAIL because importer/service do not exist.

- [ ] **Step 3: Implement MarkdownImporter**

Create `src/services/importers/MarkdownImporter.ts`:

```ts
import { ok, type Result } from '../document/errors'
import type { DocumentModel } from '../document/model'
import { createMarkdownWorkspace } from '../document/workspace-service'
import { findLocalAssetReferences } from '../assets/AssetManager'

let documentCounter = 0

function nextDocumentId() {
  documentCounter += 1
  return `document-${documentCounter}`
}

export interface MarkdownImportResult {
  document: DocumentModel
  localResourceReferences: string[]
}

export class MarkdownImporter {
  import(path: string, markdown: string): Result<MarkdownImportResult> {
    const workspace = createMarkdownWorkspace(path)
    const references = findLocalAssetReferences(markdown)
    return ok({
      document: {
        id: nextDocumentId(),
        source: { type: 'markdown', path },
        workspace,
        markdown,
        metadata: {},
        assets: { references },
        presentation: {},
        dirty: { markdown: false, assets: false, presentation: false },
      },
      localResourceReferences: references,
    })
  }
}
```

- [ ] **Step 4: Implement DocumentService markdown opening**

Create `src/services/document/document-service.ts`:

```ts
import { ok, type Result } from './errors'
import type { DocumentSession } from './session-store'
import { DocumentSessionStore } from './session-store'
import { MarkdownImporter } from '../importers/MarkdownImporter'

export interface OpenDocumentResult extends DocumentSession {
  resourceSuggestion?: {
    kind: 'suggest-mdoc'
    references: string[]
  }
}

export class DocumentService {
  private sessions = new DocumentSessionStore()
  private markdownImporter = new MarkdownImporter()

  async openMarkdown(path: string, markdown: string): Promise<Result<OpenDocumentResult>> {
    const imported = this.markdownImporter.import(path, markdown)
    if (!imported.ok) return imported

    this.sessions.add(imported.value.document)
    const session = this.sessions.get(imported.value.document.id)!
    return ok({
      ...session,
      resourceSuggestion: imported.value.localResourceReferences.length > 0
        ? { kind: 'suggest-mdoc', references: imported.value.localResourceReferences }
        : undefined,
    })
  }
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm test -- src/services/document/__tests__/document-service-markdown.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/importers/MarkdownImporter.ts src/services/document/document-service.ts src/services/document/__tests__/document-service-markdown.test.ts
git commit -m "feat: add markdown document service flow"
```

---

### Task 8: DOCX Import/Export Commands Without Base64 Persistence

**Files:**
- Create: `src-tauri/src/pandoc/mod.rs`
- Create: `src-tauri/src/pandoc/binary.rs`
- Create: `src-tauri/src/pandoc/args.rs`
- Create: `src-tauri/src/pandoc/health.rs`
- Create: `src-tauri/src/document/mod.rs`
- Create: `src-tauri/src/document/docx_import.rs`
- Create: `src-tauri/src/document/docx_export.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/converter.rs`

**Interfaces:**
- Produces Rust commands: `import_docx_to_workspace(input_path: String, workspace_root: String)`, `export_workspace_to_docx(input: ExportWorkspaceToDocxInput)`
- Preserves existing commands as compatibility wrappers until frontend migration is complete.

- [ ] **Step 1: Write argument-builder tests**

Create `src-tauri/src/pandoc/args.rs`:

```rust
pub fn docx_import_args(input_path: &str, media_root: &str) -> Vec<String> {
    vec![]
}

pub fn docx_export_args(input_md: &str, output_docx: &str, reference_docx: Option<&str>) -> Vec<String> {
    vec![]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn import_args_extract_media_without_base64_embedding() {
        let args = docx_import_args("/docs/a.docx", "/tmp/workspace");
        assert!(args.contains(&"--extract-media".to_string()));
        assert!(args.contains(&"/tmp/workspace".to_string()));
        assert!(!args.iter().any(|arg| arg.contains("base64")));
    }

    #[test]
    fn export_args_include_reference_docx_when_present() {
        let args = docx_export_args("/tmp/document.md", "/docs/out.docx", Some("/tmp/reference.docx"));
        assert!(args.contains(&"--reference-doc".to_string()));
        assert!(args.contains(&"/tmp/reference.docx".to_string()));
    }
}
```

- [ ] **Step 2: Run Rust tests to verify failure**

Run: `cd src-tauri && cargo test pandoc::args`

Expected: FAIL because args are empty and modules are not wired.

- [ ] **Step 3: Wire modules**

Modify `src-tauri/src/lib.rs`:

```rust
mod pandoc;
mod document;
```

Add commands:

```rust
document::docx_import::import_docx_to_workspace,
document::docx_export::export_workspace_to_docx,
```

Create `src-tauri/src/pandoc/mod.rs`:

```rust
pub mod args;
pub mod binary;
pub mod health;
```

Create `src-tauri/src/document/mod.rs`:

```rust
pub mod docx_import;
pub mod docx_export;
```

- [ ] **Step 4: Implement Pandoc arg builders**

Replace `src-tauri/src/pandoc/args.rs`:

```rust
pub fn docx_import_args(input_path: &str, media_root: &str) -> Vec<String> {
    vec![
        input_path.to_string(),
        "-t".to_string(),
        "markdown-simple_tables-multiline_tables-grid_tables+pipe_tables-link_attributes-raw_attribute".to_string(),
        "--extract-media".to_string(),
        media_root.to_string(),
        "--wrap=none".to_string(),
    ]
}

pub fn docx_export_args(input_md: &str, output_docx: &str, reference_docx: Option<&str>) -> Vec<String> {
    let mut args = vec![
        input_md.to_string(),
        "-o".to_string(),
        output_docx.to_string(),
        "--wrap=none".to_string(),
        "--from".to_string(),
        "markdown-implicit_figures+hard_line_breaks".to_string(),
    ];
    if let Some(reference) = reference_docx {
        args.push("--reference-doc".to_string());
        args.push(reference.to_string());
    }
    args
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn import_args_extract_media_without_base64_embedding() {
        let args = docx_import_args("/docs/a.docx", "/tmp/workspace");
        assert!(args.contains(&"--extract-media".to_string()));
        assert!(args.contains(&"/tmp/workspace".to_string()));
        assert!(!args.iter().any(|arg| arg.contains("base64")));
    }

    #[test]
    fn export_args_include_reference_docx_when_present() {
        let args = docx_export_args("/tmp/document.md", "/docs/out.docx", Some("/tmp/reference.docx"));
        assert!(args.contains(&"--reference-doc".to_string()));
        assert!(args.contains(&"/tmp/reference.docx".to_string()));
    }
}
```

- [ ] **Step 5: Move binary lookup without deleting compatibility behavior**

Create `src-tauri/src/pandoc/binary.rs` by moving the existing `find_bin()` implementation from `converter.rs` into:

```rust
pub fn find_bin(name: &str) -> String {
    #[cfg(target_os = "macos")]
    {
        let candidates = [
            format!("/opt/homebrew/bin/{}", name),
            format!("/usr/local/bin/{}", name),
            format!("/usr/bin/{}", name),
        ];
        for path in &candidates {
            if std::path::Path::new(path).exists() {
                return path.clone();
            }
        }
        if let Ok(output) = std::process::Command::new("/bin/sh")
            .arg("-l")
            .arg("-c")
            .arg(format!("which {}", name))
            .output()
        {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    return path;
                }
            }
        }
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Ok(output) = std::process::Command::new("which").arg(name).output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    return path;
                }
            }
        }
    }
    name.to_string()
}
```

Then update `converter.rs` calls to use `crate::pandoc::binary::find_bin`.

- [ ] **Step 6: Implement document-level DOCX commands**

Create `src-tauri/src/document/docx_import.rs`:

```rust
use serde::{Deserialize, Serialize};
use std::fs;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocxImportResult {
    pub workspace_root: String,
    pub markdown_path: String,
    pub assets_path: String,
}

#[tauri::command]
pub fn import_docx_to_workspace(input_path: String, workspace_root: String) -> Result<DocxImportResult, String> {
    let assets_path = format!("{}/assets", workspace_root);
    fs::create_dir_all(&assets_path).map_err(|_| "workspace.createFailed".to_string())?;

    let args = crate::pandoc::args::docx_import_args(&input_path, &workspace_root);
    let output = Command::new(crate::pandoc::binary::find_bin("pandoc"))
        .args(args)
        .output()
        .map_err(|_| "import.docxFailed".to_string())?;

    if !output.status.success() {
        return Err("import.docxFailed".to_string());
    }

    let markdown_path = format!("{}/document.md", workspace_root);
    fs::write(&markdown_path, output.stdout).map_err(|_| "workspace.writeFailed".to_string())?;

    Ok(DocxImportResult {
        workspace_root,
        markdown_path,
        assets_path,
    })
}
```

Create `src-tauri/src/document/docx_export.rs`:

```rust
use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportWorkspaceToDocxInput {
    pub markdown_path: String,
    pub output_path: String,
    pub reference_docx: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportWorkspaceToDocxResult {
    pub output_path: String,
}

#[tauri::command]
pub fn export_workspace_to_docx(input: ExportWorkspaceToDocxInput) -> Result<ExportWorkspaceToDocxResult, String> {
    let args = crate::pandoc::args::docx_export_args(
        &input.markdown_path,
        &input.output_path,
        input.reference_docx.as_deref(),
    );
    let output = Command::new(crate::pandoc::binary::find_bin("pandoc"))
        .args(args)
        .output()
        .map_err(|_| "export.docxFailed".to_string())?;

    if !output.status.success() {
        return Err("export.docxFailed".to_string());
    }

    Ok(ExportWorkspaceToDocxResult { output_path: input.output_path })
}
```

- [ ] **Step 7: Run Rust tests**

Run: `cd src-tauri && cargo test pandoc document`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/src/pandoc src-tauri/src/document src-tauri/src/converter.rs
git commit -m "refactor: add workspace docx import export commands"
```

---

### Task 9: Frontend DOCX Importer And Exporter

**Files:**
- Create: `src/services/importers/DocxImporter.ts`
- Create: `src/services/exporters/DocxExporter.ts`
- Create: `src/services/document/__tests__/docx-import-export.test.ts`

**Interfaces:**
- Consumes: Rust commands `import_docx_to_workspace`, `export_workspace_to_docx`
- Produces: `DocxImporter.import(path, workspaceRoot)`, `DocxExporter.export(document, outputPath)`

- [ ] **Step 1: Write failing tests**

Create `src/services/document/__tests__/docx-import-export.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { DocxImporter } from '../../importers/DocxImporter'
import { DocxExporter } from '../../exporters/DocxExporter'

describe('DOCX importer/exporter', () => {
  it('imports docx as workspace source without base64 markdown', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      workspaceRoot: '/tmp/markdoc/doc-1',
      markdownPath: '/tmp/markdoc/doc-1/document.md',
      assetsPath: '/tmp/markdoc/doc-1/assets',
    })
    const importer = new DocxImporter()
    const result = await importer.import('/docs/report.docx', '/tmp/markdoc/doc-1')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.source).toEqual({
        type: 'docx',
        originalPath: '/docs/report.docx',
        workspacePath: '/tmp/markdoc/doc-1',
      })
      expect(result.value.workspace.entryPath).toBe('/tmp/markdoc/doc-1/document.md')
    }
  })

  it('exports document workspace through docx command', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ outputPath: '/docs/report.docx' })
    const exporter = new DocxExporter()
    const result = await exporter.export({
      markdownPath: '/tmp/doc/document.md',
      outputPath: '/docs/report.docx',
      referenceDocx: '/tmp/doc/presentation/reference.docx',
    })
    expect(result.ok).toBe(true)
    expect(invoke).toHaveBeenCalledWith('export_workspace_to_docx', {
      input: {
        markdownPath: '/tmp/doc/document.md',
        outputPath: '/docs/report.docx',
        referenceDocx: '/tmp/doc/presentation/reference.docx',
      },
    })
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test -- src/services/document/__tests__/docx-import-export.test.ts`

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement DocxImporter**

Create `src/services/importers/DocxImporter.ts`:

```ts
import { invoke } from '@tauri-apps/api/core'
import { err, ok, type Result } from '../document/errors'
import type { DocumentModel } from '../document/model'
import { createTemporaryWorkspace } from '../document/workspace-service'

let documentCounter = 0
function nextDocumentId() {
  documentCounter += 1
  return `docx-document-${documentCounter}`
}

interface DocxImportCommandResult {
  workspaceRoot: string
  markdownPath: string
  assetsPath: string
}

export class DocxImporter {
  async import(inputPath: string, workspaceRoot: string): Promise<Result<DocumentModel>> {
    try {
      const result = await invoke<DocxImportCommandResult>('import_docx_to_workspace', {
        inputPath,
        workspaceRoot,
      })
      const workspace = createTemporaryWorkspace(result.workspaceRoot, 'docx-import')
      return ok({
        id: nextDocumentId(),
        source: { type: 'docx', originalPath: inputPath, workspacePath: result.workspaceRoot },
        workspace,
        markdown: '',
        metadata: {},
        assets: { references: [] },
        presentation: { docx: { referenceDocx: inputPath } },
        dirty: { markdown: false, assets: false, presentation: false },
      })
    } catch (cause) {
      return err('import.docxFailed', { messageKey: 'errors.import.docxFailed', cause })
    }
  }
}
```

- [ ] **Step 4: Implement DocxExporter**

Create `src/services/exporters/DocxExporter.ts`:

```ts
import { invoke } from '@tauri-apps/api/core'
import { err, ok, type Result } from '../document/errors'

export interface DocxExportInput {
  markdownPath: string
  outputPath: string
  referenceDocx?: string
}

export class DocxExporter {
  async export(input: DocxExportInput): Promise<Result<{ outputPath: string }>> {
    try {
      const result = await invoke<{ outputPath: string }>('export_workspace_to_docx', {
        input: {
          markdownPath: input.markdownPath,
          outputPath: input.outputPath,
          referenceDocx: input.referenceDocx,
        },
      })
      return ok(result)
    } catch (cause) {
      return err('export.docxFailed', { messageKey: 'errors.export.docxFailed', cause })
    }
  }
}
```

- [ ] **Step 5: Add locale error keys**

Add matching `errors.import.docxFailed` and `errors.export.docxFailed` keys to `zh.ts` and `en.ts`.

Use English:

```ts
import: { docxFailed: 'Failed to import Word document' },
export: { docxFailed: 'Failed to export Word document' },
```

Use Chinese:

```ts
import: { docxFailed: '导入 Word 文档失败' },
export: { docxFailed: '导出 Word 文档失败' },
```

- [ ] **Step 6: Run tests**

Run: `pnpm test -- src/services/document/__tests__/docx-import-export.test.ts src/locales/__tests__/locale-keys.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/importers/DocxImporter.ts src/services/exporters/DocxExporter.ts src/services/document/__tests__/docx-import-export.test.ts src/locales/zh.ts src/locales/en.ts
git commit -m "feat: add workspace docx frontend import export"
```

---

### Task 10: Editor Adapter Boundary And Asset Insertion

**Files:**
- Create: `src/components/Editor/editor-adapter.ts`
- Create: `src/components/Editor/VditorEditorAdapter.ts`
- Create: `src/components/Editor/__tests__/EditorAdapter.test.ts`
- Modify: `src/components/Editor/Editor.tsx`

**Interfaces:**
- Produces: `DocumentEditorAdapter`, `EditorLocaleConfig`, `VditorEditorAdapter`
- Consumes: `AssetRef` from `AssetManager`

- [ ] **Step 1: Write failing adapter tests**

Create `src/components/Editor/__tests__/EditorAdapter.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { VditorEditorAdapter } from '../VditorEditorAdapter'

describe('VditorEditorAdapter', () => {
  it('gets and sets markdown without exposing Vditor to document services', () => {
    const vditor = {
      getValue: vi.fn(() => '# Hello'),
      setValue: vi.fn(),
      focus: vi.fn(),
      insertValue: vi.fn(),
    }
    const adapter = new VditorEditorAdapter(vditor)
    expect(adapter.getMarkdown()).toBe('# Hello')
    adapter.setMarkdown('# Changed')
    expect(vditor.setValue).toHaveBeenCalledWith('# Changed')
  })

  it('inserts images using clean relative markdown references', () => {
    const vditor = {
      getValue: vi.fn(),
      setValue: vi.fn(),
      focus: vi.fn(),
      insertValue: vi.fn(),
    }
    const adapter = new VditorEditorAdapter(vditor)
    adapter.insertImage({ markdownPath: 'assets/a.png', absolutePath: '/tmp/a.png', kind: 'image', mimeType: 'image/png' })
    expect(vditor.insertValue).toHaveBeenCalledWith('![image](assets/a.png)')
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test -- src/components/Editor/__tests__/EditorAdapter.test.ts`

Expected: FAIL because adapter modules do not exist.

- [ ] **Step 3: Define adapter interface**

Create `src/components/Editor/editor-adapter.ts`:

```ts
import type { AssetRef } from '../../services/assets/AssetManager'

export interface EditorLocaleConfig {
  uiLanguage: 'zh' | 'en'
  editorLanguage: 'zh_CN' | 'en_US'
  documentLanguage?: string
}

export interface DocumentEditorAdapter {
  getMarkdown(): string
  setMarkdown(markdown: string): void
  focus(): void
  insertImage(asset: AssetRef): void
  insertAttachment(asset: AssetRef): void
}
```

- [ ] **Step 4: Implement Vditor adapter**

Create `src/components/Editor/VditorEditorAdapter.ts`:

```ts
import type { AssetRef } from '../../services/assets/AssetManager'
import type { DocumentEditorAdapter } from './editor-adapter'

interface VditorLike {
  getValue(): string
  setValue(markdown: string): void
  focus(): void
  insertValue(markdown: string): void
}

export class VditorEditorAdapter implements DocumentEditorAdapter {
  constructor(private vditor: VditorLike) {}

  getMarkdown() {
    return this.vditor.getValue()
  }

  setMarkdown(markdown: string) {
    this.vditor.setValue(markdown)
  }

  focus() {
    this.vditor.focus()
  }

  insertImage(asset: AssetRef) {
    this.vditor.insertValue(`![image](${asset.markdownPath})`)
  }

  insertAttachment(asset: AssetRef) {
    this.vditor.insertValue(`[${asset.markdownPath}](${asset.markdownPath})`)
  }
}
```

- [ ] **Step 5: Wire adapter creation in Editor**

Modify `src/components/Editor/Editor.tsx` minimally:

```ts
import { VditorEditorAdapter } from './VditorEditorAdapter'
import type { DocumentEditorAdapter, EditorLocaleConfig } from './editor-adapter'
```

Add props:

```ts
  onAdapterReady?: (adapter: DocumentEditorAdapter) => void
  locale?: EditorLocaleConfig
```

In `after`, after `vditorRef.current = vd`:

```ts
onAdapterReady?.(new VditorEditorAdapter(vd))
```

Keep the existing Vditor behavior otherwise unchanged.

- [ ] **Step 6: Run tests**

Run: `pnpm test -- src/components/Editor/__tests__/EditorAdapter.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/Editor/editor-adapter.ts src/components/Editor/VditorEditorAdapter.ts src/components/Editor/__tests__/EditorAdapter.test.ts src/components/Editor/Editor.tsx
git commit -m "feat: add document editor adapter boundary"
```

---

### Task 11: Document Context And EditorPage Migration

**Files:**
- Create: `src/contexts/DocumentContext.tsx`
- Create: `src/contexts/__tests__/DocumentContext.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/pages/EditorPage.tsx`
- Modify: `src/components/ExportDocxDialog.tsx`

**Interfaces:**
- Consumes: `DocumentService`, save strategy, importers/exporters
- Produces: `useDocument()` replacement behavior for tabs, active document, opening, saving, exporting, external conflict UI

- [ ] **Step 1: Write failing context tests**

Create `src/contexts/__tests__/DocumentContext.test.tsx`:

```tsx
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DocumentProvider, useDocument } from '../DocumentContext'

describe('DocumentContext', () => {
  it('creates new document tabs with mdoc default save kind', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DocumentProvider>{children}</DocumentProvider>
    )
    const { result } = renderHook(() => useDocument(), { wrapper })
    act(() => result.current.createNewDocument())
    expect(result.current.tabs).toHaveLength(1)
    expect(result.current.activeDocument?.source.type).toBe('new')
    expect(result.current.activeSaveDecision?.defaultKind).toBe('mdoc')
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test -- src/contexts/__tests__/DocumentContext.test.tsx`

Expected: FAIL because `DocumentContext` does not exist.

- [ ] **Step 3: Implement initial DocumentContext**

Create `src/contexts/DocumentContext.tsx`:

```tsx
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { DocumentModel } from '../services/document/model'
import { resolveSaveTarget, type SaveTargetDecision } from '../services/document/save-strategy'

interface DocumentTab {
  id: string
  documentId: string
  name: string
}

interface DocumentContextValue {
  tabs: DocumentTab[]
  activeTabId: string | null
  activeDocument: DocumentModel | null
  activeSaveDecision: SaveTargetDecision | null
  createNewDocument: () => void
  setActiveMarkdown: (markdown: string) => void
}

const DocumentContext = createContext<DocumentContextValue | null>(null)
let documentCounter = 0

function nextId() {
  documentCounter += 1
  return `document-${documentCounter}`
}

export function DocumentProvider({ children }: { children: ReactNode }) {
  const [documents, setDocuments] = useState<DocumentModel[]>([])
  const [tabs, setTabs] = useState<DocumentTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  const activeTab = tabs.find(tab => tab.id === activeTabId) || null
  const activeDocument = documents.find(doc => doc.id === activeTab?.documentId) || null
  const activeSaveDecision = activeDocument ? resolveSaveTarget(activeDocument) : null

  const createNewDocument = useCallback(() => {
    const id = nextId()
    const document: DocumentModel = {
      id,
      source: { type: 'new' },
      workspace: {
        id: `workspace-${id}`,
        entryPath: 'document.md',
        storage: { type: 'temporary', rootPath: '', recoveryKey: id },
      },
      markdown: '',
      metadata: {},
      assets: { references: [] },
      presentation: {},
      dirty: { markdown: false, assets: false, presentation: false },
    }
    const tab = { id: `tab-${id}`, documentId: id, name: 'untitled.mdoc' }
    setDocuments(prev => [...prev, document])
    setTabs(prev => [...prev, tab])
    setActiveTabId(tab.id)
  }, [])

  const setActiveMarkdown = useCallback((markdown: string) => {
    if (!activeDocument) return
    setDocuments(prev => prev.map(doc => doc.id === activeDocument.id
      ? { ...doc, markdown, dirty: { ...doc.dirty, markdown: true } }
      : doc
    ))
  }, [activeDocument])

  const value = useMemo(() => ({
    tabs,
    activeTabId,
    activeDocument,
    activeSaveDecision,
    createNewDocument,
    setActiveMarkdown,
  }), [tabs, activeTabId, activeDocument, activeSaveDecision, createNewDocument, setActiveMarkdown])

  return <DocumentContext.Provider value={value}>{children}</DocumentContext.Provider>
}

export function useDocument() {
  const ctx = useContext(DocumentContext)
  if (!ctx) throw new Error('useDocument must be used within DocumentProvider')
  return ctx
}
```

- [ ] **Step 4: Wrap app with DocumentProvider**

Modify `src/App.tsx`:

```tsx
import { DocumentProvider } from './contexts/DocumentContext'
```

Wrap the existing shell:

```tsx
<DocumentProvider>
  <FileProvider>
    <PandocGuard>
      <AppShell />
    </PandocGuard>
  </FileProvider>
</DocumentProvider>
```

Keep `FileProvider` temporarily so old UI paths continue to work while EditorPage migrates.

- [ ] **Step 5: Begin EditorPage migration through compatibility**

Modify `src/pages/EditorPage.tsx` to import `useDocument()` and prefer `document.activeDocument` for new-document flow. Keep existing `useFile()` paths for old open/save operations during this task.

Add near current hooks:

```ts
const documentContext = useDocument()
```

Change empty-state New button and `Cmd+N` path to call:

```ts
documentContext.createNewDocument()
```

Map active document content when it exists:

```ts
const content = documentContext.activeDocument?.markdown ?? activeTab?.content ?? ''
```

Change `handleContentChange`:

```ts
const handleContentChange = useCallback((md: string) => {
  if (documentContext.activeDocument) {
    documentContext.setActiveMarkdown(md)
    return
  }
  setTabContent(md)
}, [documentContext, setTabContent])
```

- [ ] **Step 6: Run tests and build check**

Run: `pnpm test -- src/contexts/__tests__/DocumentContext.test.tsx`

Expected: PASS.

Run: `pnpm build:check`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/contexts/DocumentContext.tsx src/contexts/__tests__/DocumentContext.test.tsx src/App.tsx src/pages/EditorPage.tsx
git commit -m "feat: introduce document context for workspace sessions"
```

---

### Task 12: Replace Legacy File Save/Open Paths With DocumentService

**Files:**
- Modify: `src/contexts/DocumentContext.tsx`
- Modify: `src/pages/EditorPage.tsx`
- Modify: `src/services/file.ts`
- Modify: `src/contexts/FileContext.tsx`
- Create: `src/services/document/__tests__/document-service-save.test.ts`

**Interfaces:**
- Consumes: `PackageExporter`, `MarkdownImporter`, `DocxImporter`, `DocxExporter`, `resolveSaveTarget()`
- Produces: `DocumentContext.openFileFromPath()`, `DocumentContext.saveActiveDocument()`, `DocumentContext.exportActiveDocx()`

- [ ] **Step 1: Write failing save behavior tests**

Create `src/services/document/__tests__/document-service-save.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { resolveSaveTarget } from '../save-strategy'
import type { DocumentModel } from '../model'

function doc(source: DocumentModel['source']): DocumentModel {
  return {
    id: 'doc-1',
    source,
    workspace: { id: 'w1', entryPath: 'document.md', storage: { type: 'temporary', rootPath: '/tmp/w1', recoveryKey: 'r1' }, rootPath: '/tmp/w1' },
    markdown: '# x',
    metadata: {},
    assets: { references: [] },
    presentation: {},
    dirty: { markdown: true, assets: false, presentation: false },
  }
}

describe('document save behavior', () => {
  it('docx source primary save resolves to mdoc and never docx overwrite', () => {
    const decision = resolveSaveTarget(doc({ type: 'docx', originalPath: '/docs/a.docx', workspacePath: '/tmp/w1' }))
    expect(decision.defaultKind).toBe('mdoc')
    expect(decision.disallowOverwriteOriginal).toBe(true)
    expect(decision.allowedKinds).not.toContain('docx')
  })

  it('new documents default to mdoc with markdown as alternate', () => {
    const decision = resolveSaveTarget(doc({ type: 'new' }))
    expect(decision.defaultKind).toBe('mdoc')
    expect(decision.allowedKinds).toEqual(['mdoc', 'markdown'])
  })
})
```

- [ ] **Step 2: Run tests**

Run: `pnpm test -- src/services/document/__tests__/document-service-save.test.ts`

Expected: PASS if earlier save strategy is correct.

- [ ] **Step 3: Add document open/save methods to DocumentContext**

Extend `DocumentContextValue`:

```ts
openFileFromPath: (path: string, name: string) => Promise<void>
saveActiveDocument: () => Promise<void>
exportActiveDocx: (outputPath: string, referenceDocx?: string) => Promise<void>
```

Move the `openFileFromPath` logic out of `FileContext` into `DocumentContext`:

- `.md` uses `readTextFile(path)` + `DocumentService.openMarkdown(path, content)`
- `.docx` creates a temporary workspace root and uses `DocxImporter.import(path, root)`
- `.mdoc` uses `PackageImporter.inspect(path)` and package workspace extraction command from Task 4

Use this branch condition:

```ts
const lower = path.toLowerCase()
if (lower.endsWith('.mdoc')) {
  // PackageImporter path
} else if (lower.endsWith('.docx')) {
  // DocxImporter path
} else {
  // MarkdownImporter path
}
```

- [ ] **Step 4: Update EditorPage to use DocumentContext for open/save/export**

In `src/pages/EditorPage.tsx`:

- Replace toolbar actions `onNew`, `onOpen`, `onExportDocx`, and `onSave` to call `documentContext`.
- Keep recent files and sidebar dispatch behavior through compatibility only until `FileContext` is deleted.
- Ensure `handleSave()` calls `documentContext.saveActiveDocument()` when `activeDocument` exists.
- Ensure DOCX export calls `documentContext.exportActiveDocx(outputPath, refPath)`.

- [ ] **Step 5: Shrink FileContext to compatibility wrapper**

Modify `src/contexts/FileContext.tsx` so it no longer invokes `pandoc_docx_to_markdown` for new flows. Leave exported functions only where old components still consume them. Add a comment:

```ts
// Compatibility context during DocumentContext migration.
// New document open/save behavior belongs in DocumentContext.
```

- [ ] **Step 6: Run build and tests**

Run: `pnpm test -- src/services/document/__tests__/document-service-save.test.ts src/contexts/__tests__/DocumentContext.test.tsx`

Expected: PASS.

Run: `pnpm build:check`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/contexts/DocumentContext.tsx src/pages/EditorPage.tsx src/services/file.ts src/contexts/FileContext.tsx src/services/document/__tests__/document-service-save.test.ts
git commit -m "refactor: route editor file flows through document service"
```

---

### Task 13: Recovery, Security, And Package UI Surfaces

**Files:**
- Create: `src/components/RecoveryPanel.tsx`
- Create: `src/components/PackageSecurityPanel.tsx`
- Create: `src/components/__tests__/RecoverySecurityPanel.test.tsx`
- Modify: `src/pages/EditorPage.tsx`
- Modify: `src/locales/zh.ts`
- Modify: `src/locales/en.ts`

**Interfaces:**
- Consumes: `RecoveryService`, `PackageSecurityPolicy`
- Produces UI for recovery states, quarantined resources, remote resource trust controls

- [ ] **Step 1: Write failing UI tests**

Create `src/components/__tests__/RecoverySecurityPanel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RecoveryPanel } from '../RecoveryPanel'
import { PackageSecurityPanel } from '../PackageSecurityPanel'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('recovery and security panels', () => {
  it('renders recovery actions without localized literals in component assertions', () => {
    render(<RecoveryPanel state={{
      documentId: 'doc-1',
      draftPath: '/tmp/recovery/doc-1/document.md',
      originalUnchanged: true,
      reason: 'cloud-lock',
      priority: ['content-preserved', 'original-unchanged', 'user-visible'],
    }} onRetry={vi.fn()} onSaveAs={vi.fn()} onRestore={vi.fn()} onDiscard={vi.fn()} />)
    expect(screen.getByText('recovery.retrySave')).toBeInTheDocument()
    expect(screen.getByText('recovery.restoreDraft')).toBeInTheDocument()
  })

  it('renders quarantined package resources and trust controls', () => {
    render(<PackageSecurityPanel quarantined={['presentation/print.css', 'presentation/reference.docx']} onTrustDocument={vi.fn()} onAllowImages={vi.fn()} />)
    expect(screen.getByText('presentation/print.css')).toBeInTheDocument()
    expect(screen.getByText('security.enableRemoteForDocument')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test -- src/components/__tests__/RecoverySecurityPanel.test.tsx`

Expected: FAIL because components do not exist.

- [ ] **Step 3: Implement RecoveryPanel**

Create `src/components/RecoveryPanel.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import type { RecoveryState } from '../services/document/recovery-service'

interface Props {
  state: RecoveryState
  onRetry: () => void
  onSaveAs: () => void
  onRestore: () => void
  onDiscard: () => void
}

export function RecoveryPanel({ state, onRetry, onSaveAs, onRestore, onDiscard }: Props) {
  const { t } = useTranslation()
  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm">
      <div className="text-foreground">{t('workspace.recoveryAvailable')}</div>
      <div className="text-muted-foreground text-xs">{state.draftPath}</div>
      <div className="mt-2 flex gap-2">
        <button onClick={onRetry}>{t('recovery.retrySave')}</button>
        <button onClick={onSaveAs}>{t('recovery.saveAs')}</button>
        <button onClick={onRestore}>{t('recovery.restoreDraft')}</button>
        <button onClick={onDiscard}>{t('recovery.discardDraft')}</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Implement PackageSecurityPanel**

Create `src/components/PackageSecurityPanel.tsx`:

```tsx
import { useTranslation } from 'react-i18next'

interface Props {
  quarantined: string[]
  onTrustDocument: () => void
  onAllowImages: () => void
}

export function PackageSecurityPanel({ quarantined, onTrustDocument, onAllowImages }: Props) {
  const { t } = useTranslation()
  if (quarantined.length === 0) return null
  return (
    <div className="border-b border-border bg-background px-4 py-2 text-sm">
      <div className="font-medium">{t('package.corruptedRecovery')}</div>
      <ul className="mt-2 text-xs text-muted-foreground">
        {quarantined.map(path => <li key={path}>{path}</li>)}
      </ul>
      <div className="mt-2 flex gap-2">
        <button onClick={onTrustDocument}>{t('security.enableRemoteForDocument')}</button>
        <button onClick={onAllowImages}>{t('security.enableRemoteImages')}</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Wire panels into EditorPage**

Add `RecoveryPanel` above the editor area when document context exposes recovery state. Add `PackageSecurityPanel` when a package import returns quarantined resources. Do not use hardcoded panel copy.

- [ ] **Step 6: Run tests**

Run: `pnpm test -- src/components/__tests__/RecoverySecurityPanel.test.tsx src/locales/__tests__/locale-keys.test.ts`

Expected: PASS.

Run: `pnpm build:check`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/RecoveryPanel.tsx src/components/PackageSecurityPanel.tsx src/components/__tests__/RecoverySecurityPanel.test.tsx src/pages/EditorPage.tsx src/locales/zh.ts src/locales/en.ts
git commit -m "feat: add recovery and package security UI"
```

---

### Task 14: Cleanup Legacy Base64 And Converter Coupling

**Files:**
- Modify: `src/services/export-preprocess.ts`
- Modify: `src/services/file.ts`
- Modify: `src-tauri/src/converter.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `src/services/document/__tests__/source-quality.test.ts`

**Interfaces:**
- Consumes: `AssetManager`, `DocxExporter`, document-level Rust commands
- Produces: no default Base64 persistence in DOCX import path, no frontend Pandoc command assembly for new flows

- [ ] **Step 1: Write source quality tests**

Create `src/services/document/__tests__/source-quality.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { containsBase64Images, findLocalAssetReferences } from '../../assets/AssetManager'

describe('source quality', () => {
  it('treats base64 image blobs as migration input, not acceptable default output', () => {
    const imported = '![x](data:image/png;base64,AAAA)'
    expect(containsBase64Images(imported)).toBe(true)
  })

  it('accepts clean relative asset references', () => {
    const markdown = '![x](assets/image-001.png)'
    expect(containsBase64Images(markdown)).toBe(false)
    expect(findLocalAssetReferences(markdown)).toEqual(['assets/image-001.png'])
  })
})
```

- [ ] **Step 2: Run source quality tests**

Run: `pnpm test -- src/services/document/__tests__/source-quality.test.ts`

Expected: PASS if Task 3 is complete.

- [ ] **Step 3: Remove new-flow dependence on `pandoc_docx_to_markdown`**

In `src/contexts/FileContext.tsx` and `src/services/file.ts`, remove calls from migrated paths to:

```ts
invoke('pandoc_docx_to_markdown')
```

Keep the Rust command only if compatibility code still calls it. If no references remain after `rg "pandoc_docx_to_markdown" src`, remove it from `invoke_handler`.

- [ ] **Step 4: Move Base64 embedding behind explicit migration naming**

In `src-tauri/src/converter.rs`, rename Base64 helper usage so it is no longer used by default DOCX import. If retained for compatibility, name it:

```rust
embed_images_as_base64_for_legacy_markdown
```

No document-level command should call that function.

- [ ] **Step 5: Remove frontend Pandoc command construction from new save flow**

Ensure new DOCX export uses:

```ts
invoke('export_workspace_to_docx', { input })
```

and not:

```ts
invoke('pandoc_convert_file', { inputPath, outputPath, extraArgs })
```

Compatibility wrappers in `src/services/file.ts` can remain only for code that has not been migrated. Add a module comment explaining that no new calls should target this service.

- [ ] **Step 6: Run repository checks**

Run: `rg -n "pandoc_docx_to_markdown|embed_images_as_base64\\(|pandoc_convert_file" src src-tauri/src`

Expected: Any remaining matches are compatibility wrappers with comments or old Rust commands pending deletion; no `DocumentContext`, `DocumentService`, `DocxImporter`, or `DocxExporter` path uses them.

Run: `pnpm test -- src/services/document/__tests__/source-quality.test.ts`

Expected: PASS.

Run: `pnpm build:check`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/export-preprocess.ts src/services/file.ts src-tauri/src/converter.rs src-tauri/src/lib.rs src/services/document/__tests__/source-quality.test.ts
git commit -m "refactor: remove base64 docx import from document flow"
```

---

### Task 15: End-To-End Verification Fixtures And Documentation Sync

**Files:**
- Create: `src/services/document/__tests__/acceptance.test.ts`
- Create: `src-tauri/src/package/tests.rs` if package module tests need extraction from inline tests
- Modify: `README.md`
- Modify: `docs/architecture/document-workspace.md`
- Modify: `docs/architecture/refactor-design.md`

**Interfaces:**
- Consumes: all previous tasks
- Produces: acceptance coverage for architecture invariants and updated product positioning

- [ ] **Step 1: Write acceptance tests for final invariants**

Create `src/services/document/__tests__/acceptance.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { resolveSaveTarget } from '../save-strategy'
import { containsBase64Images } from '../../assets/AssetManager'
import type { DocumentModel } from '../model'

function model(source: DocumentModel['source'], markdown = '# Hello'): DocumentModel {
  return {
    id: 'doc-1',
    source,
    workspace: { id: 'w1', rootPath: '/tmp/w1', entryPath: '/tmp/w1/document.md', storage: { type: 'temporary', rootPath: '/tmp/w1', recoveryKey: 'r1' } },
    markdown,
    metadata: {},
    assets: { references: [] },
    presentation: {},
    dirty: { markdown: false, assets: false, presentation: false },
  }
}

describe('document architecture acceptance', () => {
  it('keeps plain markdown as in-place save by default', () => {
    expect(resolveSaveTarget(model({ type: 'markdown', path: '/docs/readme.md' })).defaultKind).toBe('markdown')
  })

  it('saves imported docx as canonical mdoc, not docx', () => {
    const decision = resolveSaveTarget(model({ type: 'docx', originalPath: '/docs/a.docx', workspacePath: '/tmp/w1' }))
    expect(decision.defaultKind).toBe('mdoc')
    expect(decision.allowedKinds).not.toContain('docx')
  })

  it('rejects default base64 source quality', () => {
    expect(containsBase64Images('![x](data:image/png;base64,AAAA)')).toBe(true)
    expect(containsBase64Images('![x](assets/x.png)')).toBe(false)
  })
})
```

- [ ] **Step 2: Run acceptance tests**

Run: `pnpm test -- src/services/document/__tests__/acceptance.test.ts`

Expected: PASS.

- [ ] **Step 3: Update README product positioning**

Change README title copy from Markdown + Word editor positioning to:

```md
**A modern document editor with Markdown at its core.**
```

Add a short feature bullet:

```md
- **MarkDoc documents (`.mdoc`)** -- package clean Markdown, assets, and presentation resources into one portable file
```

Keep DOCX import/export and plain Markdown bullets. Do not remove setup instructions.

- [ ] **Step 4: Sync architecture docs**

Update `docs/architecture/document-workspace.md` and `docs/architecture/refactor-design.md` only if implementation changed names or signatures. Keep the invariant text intact:

```text
DOCX and PDF are delivery formats; Markdown remains the canonical semantic source whenever possible.
```

- [ ] **Step 5: Run full verification**

Run: `pnpm test`

Expected: PASS.

Run: `pnpm build:check`

Expected: PASS.

Run: `cd src-tauri && cargo test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add README.md docs/architecture/document-workspace.md docs/architecture/refactor-design.md src/services/document/__tests__/acceptance.test.ts src-tauri/src/package
git commit -m "test: add document architecture acceptance coverage"
```

---

## Self-Review Checklist

- [ ] Every task has a test command and an expected result.
- [ ] Every new user-visible text path goes through locale keys.
- [ ] `.mdoc` is treated as the default MarkDoc document format for new/imported/resource-backed documents.
- [ ] Plain `.md` remains an in-place save path unless the user chooses conversion or imports new assets.
- [ ] DOCX primary save does not overwrite original DOCX.
- [ ] Package reader identifies packages by manifest, not extension alone.
- [ ] Package writer uses atomic replacement and recovery state.
- [ ] Remote resources are denied by default.
- [ ] Corrupted packages quarantine CSS/SVG/reference.docx/remote resources.
- [ ] Vditor is behind `DocumentEditorAdapter`.
- [ ] New document flow no longer depends on `FileTab.content`.
- [ ] New DOCX flow no longer persists Base64 images by default.
