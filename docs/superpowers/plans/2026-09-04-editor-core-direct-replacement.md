# Editor Core Direct Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the active MarkDoc editor core with Tiptap over ProseMirror, keep Markdown and `.mdoc` as the storage contract, and delete the Vditor production path.

**Architecture:** MarkDoc owns the shell, toolbar, resource bridge, Markdown codec boundary, package save behavior, outline model, and i18n. Tiptap is the React editor integration layer, ProseMirror is used only inside `src/editor-core/` for schema/plugin behavior, and no app service depends on editor-library objects.

**Tech Stack:** React 19, Tauri 2, TypeScript 5.9, Vitest, Tiptap React/Core/Markdown/PM, ProseMirror through `@tiptap/pm`, existing MarkDoc `.mdoc` services.

**Spec:** `docs/architecture/editor-core.md`

## Global Constraints

- Use `pnpm`; do not use `npm` or `bun` for repository package operations.
- Do not keep Vditor as a production adapter or alternate editor path.
- Markdown remains canonical storage; Tiptap/ProseMirror JSON is runtime-only.
- `.mdoc` package resources must use UTF-8 relative paths with `/` separators and reject absolute paths, drive prefixes, backslashes, and `..`.
- Production document flow must not import `vditor`, `vditor/dist/index.css`, `src/styles/vditor.css`, or query `.vditor-*` DOM.
- Save paths must call `DocumentEditorAdapter.getMarkdown()` immediately before writing.
- Plain `.md` without package-only resources saves in place without a `.mdoc` suggestion.
- Plain `.md` with newly imported assets suggests `.mdoc` without blocking `.md` save.
- Pasted screenshots must become `assets/...` references, not default Base64 blobs.
- DOCX-imported images must render through workspace asset URLs.
- Text color and background color work in WYSIWYG and serialize to sanitized inline HTML spans only when used.
- All user-visible editor labels have `src/locales/zh.ts` and `src/locales/en.ts` keys.
- Unit, integration, lint, build, and Tauri desktop smoke checks must pass before calling this done.

---

## File Structure

Create:

- `src/editor-core/types.ts`: editor command IDs, adapter contract, asset resolver types, color palettes.
- `src/editor-core/commands.ts`: maps MarkDoc command IDs to Tiptap commands and active/can-run checks.
- `src/editor-core/markdown-codec.ts`: MarkDoc-owned codec facade around Tiptap Markdown with normalization and fixture round-trip API.
- `src/editor-core/markdoc-extensions.ts`: Tiptap extensions used by MarkDoc, including image/link/table/task/color/highlight configuration.
- `src/editor-core/asset-bridge.ts`: paste/drop/upload helpers that convert files and `data:` image Markdown to `assets/...` references.
- `src/editor-core/resource-security.ts`: editor-agnostic rendered-resource security helpers moved from `src/components/Editor/resource-policy.ts`.
- `src/editor-core/outline.ts`: heading extraction, duplicate-id stability, DOM sync, and scroll target lookup.
- `src/editor-core/__tests__/editor-contract.test.ts`: adapter command contract and static guards.
- `src/editor-core/__tests__/markdown-codec.test.ts`: golden Markdown round-trip fixtures.
- `src/editor-core/__tests__/outline.test.ts`: heading extraction and duplicate IDs.
- `src/editor-core/fixtures/markdown/*.md`: golden source fixtures.
- `src/components/Editor/TiptapMarkDocEditor.tsx`: owns `useEditor`, `EditorContent`, extension list, lifecycle, and adapter registration.
- `src/components/Editor/EditorShell.tsx`: owns editor layout, toolbar placement, paste/drop/upload event routing, and popover layer.
- `src/components/Editor/EditorToolbar.tsx`: MarkDoc-owned formatting toolbar.
- `src/components/Editor/EditorBubbleToolbar.tsx`: selection-only compact toolbar for common inline actions.
- `src/components/Editor/EditorPopoverLayer.tsx`: color, link, emoji, and upload popovers rendered by React.
- `src/components/Editor/TiptapEditorAdapter.ts`: translates `DocumentEditorAdapter` into Tiptap operations.

Modify:

- `src/components/Editor/Editor.tsx`: become a thin compatibility export that renders `EditorShell`; no Vditor import.
- `src/components/Editor/editor-adapter.ts`: re-export the contract from `src/editor-core/types.ts` or keep only UI locale typing.
- `src/components/Editor/image-paste.ts`: either move into `src/editor-core/asset-bridge.ts` or keep as a tested thin wrapper.
- `src/components/Sidebar.tsx`: use Markdown/adapter outline and `[data-markdoc-outline-id]`, not `.vditor-*`.
- `src/pages/EditorPage.tsx`: route keyboard/context-menu policy through `[data-markdoc-editor-root]`.
- `src/main.tsx`: hide native context menu globally while allowing editor selection through MarkDoc selectors, not Vditor selectors.
- `src-tauri/src/lib.rs`: replace injected `.vditor` selector with the MarkDoc editor root selector.
- `src/styles/editor.css`: replace Vditor surface styles with MarkDoc/Tiptap editor styles.
- `src/index.css`: import editor styles only; remove Vditor stylesheet import chain.
- `src/locales/zh.ts` and `src/locales/en.ts`: add missing toolbar/popover labels.
- `vitest.config.ts`: remove stale Tiptap aliases only after real Tiptap packages are installed and resolved normally.
- `package.json` and `pnpm-lock.yaml`: add Tiptap packages and remove `vditor`.
- `src/types.d.ts`: remove Vditor declarations.

Delete:

- `src/components/Editor/VditorEditorAdapter.ts`
- `src/components/Editor/vditor-toolbar.ts`
- `src/components/Editor/color-formatting.ts` once Tiptap color marks replace it
- `src/components/Editor/resource-policy.ts` after editor-agnostic code moves
- `src/styles/vditor.css`
- Vditor-specific tests whose assertions only verify Vditor internals

---

### Task 1: Contract Guards And Markdown Fixtures

**Files:**
- Create: `src/editor-core/types.ts`
- Create: `src/editor-core/__tests__/editor-contract.test.ts`
- Create: `src/editor-core/__tests__/markdown-codec.test.ts`
- Create: `src/editor-core/fixtures/markdown/basic.md`
- Create: `src/editor-core/fixtures/markdown/rich-formatting.md`
- Create: `src/editor-core/fixtures/markdown/resources.md`
- Modify: `src/components/Editor/editor-adapter.ts`

**Interfaces:**
- Produces: `EditorCommand`, `DocumentEditorAdapter`, `EditorCommandAttrs`, `MarkdownCodec`, `EditorDocument`, `AssetRefLike`.
- Consumes: existing `AssetRef` shape from `src/services/assets/AssetManager.ts`.

- [ ] **Step 1: Write the failing static guard test**

```ts
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = process.cwd()
const productionFiles = [
  'src/components',
  'src/contexts',
  'src/hooks',
  'src/pages',
  'src/services',
  'src/editor-core',
]

function trackedSourceFiles() {
  const output = readFileSync(join(repoRoot, '.git', 'HEAD'), 'utf8')
  expect(output).toBeTruthy()
  return productionFiles.flatMap(root => {
    const base = join(repoRoot, root)
    if (!existsSync(base)) return []
    const stack = [base]
    const files: string[] = []
    while (stack.length) {
      const current = stack.pop()!
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const path = join(current, entry.name)
        if (entry.isDirectory()) stack.push(path)
        else if (/\.(ts|tsx|css)$/.test(entry.name)) files.push(path)
      }
    }
    return files
  })
}

describe('editor core static guards', () => {
  it('keeps production document flows free of Vditor imports and DOM selectors', () => {
    const offenders = trackedSourceFiles().filter(file => {
      const rel = relative(repoRoot, file)
      if (rel.includes('__tests__')) return false
      const source = readFileSync(file, 'utf8')
      return /from ['"]vditor['"]|vditor\/dist|src\/styles\/vditor\.css|\.vditor[-_a-zA-Z0-9]*/.test(source)
    })

    expect(offenders.map(file => relative(repoRoot, file))).toEqual([])
  })

  it('removes the legacy Vditor files from the active editor tree', () => {
    expect(existsSync(join(repoRoot, 'src/components/Editor/VditorEditorAdapter.ts'))).toBe(false)
    expect(existsSync(join(repoRoot, 'src/components/Editor/vditor-toolbar.ts'))).toBe(false)
    expect(existsSync(join(repoRoot, 'src/styles/vditor.css'))).toBe(false)
  })
})
```

- [ ] **Step 2: Run the guard test to verify it fails**

Run: `pnpm vitest run src/editor-core/__tests__/editor-contract.test.ts`

Expected: FAIL because current production files import `vditor`, query `.vditor-*`, and legacy Vditor files still exist.

- [ ] **Step 3: Write the adapter contract types**

```ts
import type { AssetRef } from '../services/assets/AssetManager'

export type EditorCommand =
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
  | 'emoji'

export type EditorCommandAttrs = {
  level?: 1 | 2 | 3 | 4 | 5 | 6
  href?: string
  title?: string
  src?: string
  alt?: string
  color?: string
  text?: string
}

export interface EditorDocument {
  type: 'doc'
  content?: unknown[]
}

export interface MarkdownCodec {
  parse(markdown: string): EditorDocument
  serialize(document: EditorDocument): string
  normalize(markdown: string): string
  roundTrip(markdown: string): string
}

export interface DocumentEditorAdapter {
  getMarkdown(): string
  setMarkdown(markdown: string, options?: { preserveHistory?: boolean }): void
  focus(): void
  blur(): void
  canRun(command: EditorCommand, attrs?: EditorCommandAttrs): boolean
  isActive(command: EditorCommand, attrs?: EditorCommandAttrs): boolean
  run(command: EditorCommand, attrs?: EditorCommandAttrs): boolean
  insertImage(asset: AssetRef): void
  insertAttachment(asset: AssetRef): void
  scrollToOutlineItem(id: string): boolean
  dispose(): void
}
```

- [ ] **Step 4: Re-export contract from the old adapter import path**

```ts
export type {
  DocumentEditorAdapter,
  EditorCommand,
  EditorCommandAttrs,
  EditorDocument,
  MarkdownCodec,
} from '../../editor-core/types'
```

- [ ] **Step 5: Add golden fixtures before implementing the codec**

`basic.md`:

```markdown
# Title

Paragraph with **strong**, *emphasis*, ~~strike~~, and `inline code`.

> Quote

- One
- Two

1. First
2. Second
```

`rich-formatting.md`:

```markdown
---
lang: zh-CN
---

## 表格

| 阶段 | 说明 |
| --- | --- |
| 信息收集 | 保留 Markdown |
| 环境部署 | 保存为 mdoc |

<span style="color: #dc2626">红色文字</span>

<span style="background-color: #fef3c7">浅色背景</span>
```

`resources.md`:

```markdown
# Resources

![local](assets/image.png)

![remote](https://images.example.com/diagram.png)

<img src="assets/docx/media/image1.png" style="width:6.98in;height:8.08in" />
```

- [ ] **Step 6: Write codec fixture tests**

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createMarkdownCodec } from '../markdown-codec'

const fixtures = ['basic.md', 'rich-formatting.md', 'resources.md']

describe('MarkdownCodec', () => {
  it.each(fixtures)('round-trips %s without lossy storage changes', file => {
    const codec = createMarkdownCodec()
    const markdown = readFileSync(join(process.cwd(), 'src/editor-core/fixtures/markdown', file), 'utf8')

    expect(codec.roundTrip(markdown)).toBe(codec.normalize(markdown))
  })
})
```

- [ ] **Step 7: Run codec tests to verify they fail**

Run: `pnpm vitest run src/editor-core/__tests__/markdown-codec.test.ts`

Expected: FAIL because `createMarkdownCodec` does not exist.

- [ ] **Step 8: Commit**

```bash
git add src/editor-core src/components/Editor/editor-adapter.ts
git commit -m "test: guard editor core replacement contract"
```

---

### Task 2: Markdown Codec And Editor-Core Pure Modules

**Files:**
- Create: `src/editor-core/markdown-codec.ts`
- Create: `src/editor-core/outline.ts`
- Create: `src/editor-core/resource-security.ts`
- Create: `src/editor-core/asset-bridge.ts`
- Create: `src/editor-core/__tests__/outline.test.ts`
- Modify: `src/components/Editor/image-paste.ts`
- Modify: `src/components/Editor/resource-policy.ts`

**Interfaces:**
- Consumes: `MarkdownCodec`, `EditorDocument`, `ImportPastedImage`, `PackageSecurityPolicy`.
- Produces: `createMarkdownCodec()`, `getEditorOutline(markdown)`, `syncOutlineDom(root, outline)`, `scrollToOutlineTarget(root, id)`, `handleEditorImagePaste`, `importEditorDataImage`.

- [ ] **Step 1: Write outline tests first**

```ts
import { describe, expect, it } from 'vitest'
import { getEditorOutline } from '../outline'

describe('getEditorOutline', () => {
  it('extracts stable heading ids and ignores fenced code headings', () => {
    expect(getEditorOutline([
      '# Title',
      '',
      '## Repeat',
      '```',
      '# Ignored',
      '```',
      '## Repeat',
    ].join('\n'))).toEqual([
      { id: 'title-1', level: 1, text: 'Title', line: 1 },
      { id: 'repeat-3', level: 2, text: 'Repeat', line: 3 },
      { id: 'repeat-7', level: 2, text: 'Repeat', line: 7 },
    ])
  })
})
```

- [ ] **Step 2: Run outline test to verify it fails**

Run: `pnpm vitest run src/editor-core/__tests__/outline.test.ts`

Expected: FAIL because `getEditorOutline` does not exist.

- [ ] **Step 3: Implement pure outline functions**

```ts
export interface EditorOutlineItem {
  id: string
  level: number
  text: string
  line: number
}

function slugify(text: string) {
  return text.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'heading'
}

export function getEditorOutline(markdown: string): EditorOutlineItem[] {
  const items: EditorOutlineItem[] = []
  let inFence = false
  markdown.split(/\r?\n/).forEach((line, index) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      return
    }
    if (inFence) return
    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (!match) return
    const text = match[2].trim()
    items.push({ id: `${slugify(text)}-${index + 1}`, level: match[1].length, text, line: index + 1 })
  })
  return items
}
```

- [ ] **Step 4: Move editor-agnostic resource security**

Move `LocalResourceUrlResolver`, `enforceRemoteResourcePolicy`, `sanitizeRenderedHtml`, `restoreBlockedResources`, and `observeRemoteResourcePolicy` into `src/editor-core/resource-security.ts`. Do not move `VditorInternals`, `installRemoteResourceRenderBoundary`, or `getCanonicalEditorMarkdown`.

- [ ] **Step 5: Keep image paste helpers editor-neutral**

Move image paste/import helpers into `asset-bridge.ts`, then make `src/components/Editor/image-paste.ts` re-export them:

```ts
export {
  describeClipboardData,
  handleEditorImagePaste,
  importEditorDataImage,
  importEditorUploadFiles,
} from '../../editor-core/asset-bridge'
export type { ImportPastedImage } from '../../editor-core/asset-bridge'
```

- [ ] **Step 6: Implement temporary codec facade**

Before Tiptap packages are installed, implement `createMarkdownCodec()` as a strict identity facade for the existing fixtures:

```ts
export function createMarkdownCodec(): MarkdownCodec {
  return {
    parse(markdown) {
      return { type: 'doc', content: [{ type: 'markdown', text: markdown }] }
    },
    serialize(document) {
      const first = Array.isArray(document.content) ? document.content[0] as { text?: string } : undefined
      return first?.text ?? ''
    },
    normalize(markdown) {
      return markdown.replace(/\r\n/g, '\n')
    },
    roundTrip(markdown) {
      const normalized = markdown.replace(/\r\n/g, '\n')
      return this.serialize(this.parse(normalized))
    },
  }
}
```

This is not the final editor storage implementation; it is the MarkDoc-owned boundary that later delegates to the Tiptap Markdown candidate.

- [ ] **Step 7: Run pure tests**

Run: `pnpm vitest run src/editor-core/__tests__/markdown-codec.test.ts src/editor-core/__tests__/outline.test.ts src/components/Editor/__tests__/image-paste.test.ts src/components/Editor/__tests__/EditorAdapter.test.ts`

Expected: PASS for new pure modules, existing Vditor tests may still pass until cleanup.

- [ ] **Step 8: Commit**

```bash
git add src/editor-core src/components/Editor/image-paste.ts src/components/Editor/resource-policy.ts
git commit -m "feat: add editor core pure boundaries"
```

---

### Task 3: Tiptap Dependencies, Extensions, And Adapter

**Files:**
- Create: `src/editor-core/markdoc-extensions.ts`
- Create: `src/editor-core/commands.ts`
- Create: `src/components/Editor/TiptapEditorAdapter.ts`
- Create: `src/components/Editor/__tests__/TiptapEditorAdapter.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: `DocumentEditorAdapter`, `EditorCommand`, `EditorCommandAttrs`, `createMarkdownCodec`, `LocalResourceUrlResolver`.
- Produces: `createMarkDocExtensions(options)`, `runEditorCommand(editor, command, attrs)`, `canRunEditorCommand(editor, command, attrs)`, `isEditorCommandActive(editor, command, attrs)`, `TiptapEditorAdapter`.

- [ ] **Step 1: Install dependencies with pnpm**

Run: `pnpm add @tiptap/react @tiptap/core @tiptap/starter-kit @tiptap/markdown @tiptap/pm @tiptap/extension-image @tiptap/extension-link @tiptap/extension-table @tiptap/extension-table-row @tiptap/extension-table-header @tiptap/extension-table-cell @tiptap/extension-task-list @tiptap/extension-task-item @tiptap/extension-text-style @tiptap/extension-color @tiptap/extension-highlight @tiptap/extension-placeholder`

Run: `pnpm remove vditor`

Expected: `package.json` removes `vditor` and adds Tiptap packages; lockfile updates.

- [ ] **Step 2: Write adapter tests first**

```ts
import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createMarkDocExtensions } from '../../../editor-core/markdoc-extensions'
import { TiptapEditorAdapter } from '../TiptapEditorAdapter'

let editor: Editor | null = null

afterEach(() => {
  editor?.destroy()
  editor = null
})

describe('TiptapEditorAdapter', () => {
  it('gets and sets canonical Markdown through the MarkDoc adapter contract', () => {
    editor = new Editor({
      extensions: createMarkDocExtensions({}),
      content: '# Title',
      contentType: 'markdown',
    })

    const adapter = new TiptapEditorAdapter(editor, document.createElement('div'))
    adapter.setMarkdown('## Changed')

    expect(adapter.getMarkdown()).toContain('## Changed')
  })

  it('runs MarkDoc command ids without exposing Tiptap to document services', () => {
    editor = new Editor({
      extensions: createMarkDocExtensions({}),
      content: 'Text',
      contentType: 'markdown',
    })
    const adapter = new TiptapEditorAdapter(editor, document.createElement('div'))

    expect(adapter.run('bold')).toBe(true)
    expect(adapter.canRun('bold')).toBe(true)
  })

  it('inserts package-relative images and attachments as clean Markdown', () => {
    editor = new Editor({
      extensions: createMarkDocExtensions({}),
      content: '',
      contentType: 'markdown',
    })
    const adapter = new TiptapEditorAdapter(editor, document.createElement('div'))

    adapter.insertImage({ markdownPath: 'assets/a.png', workspacePath: '/tmp/a.png' })
    adapter.insertAttachment({ markdownPath: 'assets/report.pdf', workspacePath: '/tmp/report.pdf' })

    expect(adapter.getMarkdown()).toContain('![image](assets/a.png)')
    expect(adapter.getMarkdown()).toContain('[assets/report.pdf](assets/report.pdf)')
  })
})
```

- [ ] **Step 3: Run adapter tests to verify they fail**

Run: `pnpm vitest run src/components/Editor/__tests__/TiptapEditorAdapter.test.ts`

Expected: FAIL because Tiptap adapter and extension factory do not exist.

- [ ] **Step 4: Implement command registry**

Implement each `EditorCommand` through `editor.chain().focus()` and `editor.can().chain().focus()`:

```ts
export function runEditorCommand(editor: Editor, command: EditorCommand, attrs: EditorCommandAttrs = {}) {
  if (command === 'bold') return editor.chain().focus().toggleBold().run()
  if (command === 'heading') return editor.chain().focus().toggleHeading({ level: attrs.level ?? 2 }).run()
  if (command === 'textColor') return editor.chain().focus().setColor(attrs.color ?? '#111827').run()
  if (command === 'backgroundColor') return editor.chain().focus().toggleHighlight({ color: attrs.color ?? '#fef3c7' }).run()
  if (command === 'clearFormatting') return editor.chain().focus().unsetAllMarks().clearNodes().run()
  return false
}
```

Fill the registry for every command in `EditorCommand`; unsupported command IDs must return `false`, not throw.

- [ ] **Step 5: Implement Tiptap extension factory**

Use current Tiptap packages:

```ts
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import TextStyle from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import Placeholder from '@tiptap/extension-placeholder'

export function createMarkDocExtensions(options: { placeholder?: string }) {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] } }),
    Markdown,
    Image.configure({ allowBase64: false, inline: false }),
    Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({ nested: true }),
    TextStyle,
    Color.configure({ types: [TextStyle.name] }),
    Highlight.configure({ multicolor: true }),
    Placeholder.configure({ placeholder: options.placeholder ?? '' }),
  ]
}
```

- [ ] **Step 6: Implement Tiptap adapter**

Use `editor.getMarkdown()` when present and `editor.commands.setContent(markdown, { contentType: 'markdown' })` for source updates. `dispose()` must destroy only once.

- [ ] **Step 7: Remove stale Vitest aliases**

Delete the manual `@tiptap/*` alias/optimizer workaround in `vitest.config.ts` if normal dependency resolution works after installation.

- [ ] **Step 8: Run adapter and codec tests**

Run: `pnpm vitest run src/components/Editor/__tests__/TiptapEditorAdapter.test.ts src/editor-core/__tests__/markdown-codec.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts src/editor-core src/components/Editor/TiptapEditorAdapter.ts src/components/Editor/__tests__/TiptapEditorAdapter.test.ts
git commit -m "feat: add Tiptap editor adapter"
```

---

### Task 4: MarkDoc Editor Shell, Toolbar, Popovers, And Asset Bridge

**Files:**
- Create: `src/components/Editor/EditorShell.tsx`
- Create: `src/components/Editor/TiptapMarkDocEditor.tsx`
- Create: `src/components/Editor/EditorToolbar.tsx`
- Create: `src/components/Editor/EditorBubbleToolbar.tsx`
- Create: `src/components/Editor/EditorPopoverLayer.tsx`
- Create: `src/components/Editor/__tests__/EditorShell.test.tsx`
- Modify: `src/components/Editor/Editor.tsx`
- Modify: `src/styles/editor.css`
- Modify: `src/locales/zh.ts`
- Modify: `src/locales/en.ts`

**Interfaces:**
- Consumes: `TiptapEditorAdapter`, `createMarkDocExtensions`, `handleEditorImagePaste`, `importEditorDataImage`, `PackageSecurityPolicy`, `LocalResourceUrlResolver`.
- Produces: active editor UI with `[data-markdoc-editor-root]`, `[data-markdoc-editor-content]`, bottom formatting toolbar, React popovers, paste/upload import through `onImagePaste`.

- [ ] **Step 1: Write React shell tests first**

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Editor from '../Editor'

describe('MarkDoc editor shell', () => {
  it('renders a MarkDoc-owned toolbar instead of moving library DOM', async () => {
    render(<Editor content="# Title" onChange={() => {}} />)

    expect(await screen.findByRole('toolbar', { name: 'editor.formattingToolbar' })).toBeInTheDocument()
    expect(document.querySelector('.vditor-toolbar')).toBeNull()
  })

  it('imports pasted screenshots into assets before inserting Markdown', async () => {
    const onImagePaste = vi.fn(async () => 'assets/pasted.png')
    const onChange = vi.fn()
    render(<Editor content="" onChange={onChange} onImagePaste={onImagePaste} />)

    const editor = await screen.findByTestId('markdoc-editor-content')
    const file = new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' })
    fireEvent.paste(editor, {
      clipboardData: {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
        files: [file],
        types: ['Files'],
      },
    })

    await waitFor(() => expect(onImagePaste).toHaveBeenCalledWith(file))
  })
})
```

- [ ] **Step 2: Run shell tests to verify they fail**

Run: `pnpm vitest run src/components/Editor/__tests__/EditorShell.test.tsx`

Expected: FAIL because the active editor still creates Vditor.

- [ ] **Step 3: Implement `TiptapMarkDocEditor`**

Create the Tiptap instance with `useEditor`, `EditorContent`, `createMarkDocExtensions`, `onUpdate`, `onCreate`, and adapter registration. Keep `onUpdate` as UI sync only; save still goes through `adapter.getMarkdown()`.

- [ ] **Step 4: Implement `EditorShell`**

Use this DOM shape:

```tsx
<section className="markdoc-editor-shell" data-markdoc-editor-root>
  <div className="markdoc-editor-scroll">
    <TiptapMarkDocEditor />
  </div>
  <EditorToolbar />
  <EditorPopoverLayer />
</section>
```

Toolbar is visually bottom-floating, compact, semi-transparent at rest, opaque on hover/focus, and has no heavy shadow.

- [ ] **Step 5: Implement toolbar command buttons**

Toolbar buttons call `adapter.run(command, attrs)` and use `adapter.isActive`/`adapter.canRun`. Include heading, bold, italic, strike, blockquote, bullet list, ordered list, task list, inline code, code block, link, table, upload image, text color, background color, horizontal rule, and emoji. Do not add undo/redo toolbar buttons.

- [ ] **Step 6: Implement React popovers**

Color swatches apply immediately on click. Text colors use saturated colors; background colors use light highlight colors. Emoji popover has categories and no hover-tail text.

- [ ] **Step 7: Implement paste/drop/upload**

Clipboard image files and upload image files call `onImagePaste(file)` and insert `![image](assets/...)`. `data:` images inside pasted Markdown are converted with `importEditorDataImage` when possible.

- [ ] **Step 8: Run shell and existing editor tests**

Run: `pnpm vitest run src/components/Editor/__tests__/EditorShell.test.tsx src/components/Editor/__tests__/image-paste.test.ts src/components/Editor/__tests__/emoji-picker.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/Editor src/styles/editor.css src/locales/zh.ts src/locales/en.ts
git commit -m "feat: replace editor shell with Tiptap"
```

---

### Task 5: App Integration And Vditor Cleanup

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/pages/EditorPage.tsx`
- Modify: `src/main.tsx`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/index.css`
- Modify: `src/types.d.ts`
- Delete: `src/components/Editor/VditorEditorAdapter.ts`
- Delete: `src/components/Editor/vditor-toolbar.ts`
- Delete: `src/components/Editor/color-formatting.ts`
- Delete: `src/components/Editor/resource-policy.ts`
- Delete: `src/styles/vditor.css`
- Delete/replace: Vditor-specific tests

**Interfaces:**
- Consumes: `DocumentEditorAdapter.scrollToOutlineItem`, `getEditorOutline`, `[data-markdoc-editor-root]`.
- Produces: sidebar outline navigation without `.vditor-*`, native context menu hidden without Vditor exceptions, final cleanup that satisfies static guards.

- [ ] **Step 1: Write integration tests first**

Update `src/components/__tests__/Sidebar.test.tsx` so outline clicks assert `adapter.scrollToOutlineItem(id)` when adapter is available, and no test depends on `.vditor-reset`.

Update `src/hooks/__tests__/useDisableNativeContextMenu.test.tsx` or `src/main.tsx` tests so the native context menu is prevented without referencing `.vditor`.

- [ ] **Step 2: Run integration tests to verify failures**

Run: `pnpm vitest run src/components/__tests__/Sidebar.test.tsx src/hooks/__tests__/useDisableNativeContextMenu.test.tsx src/editor-core/__tests__/editor-contract.test.ts`

Expected: FAIL until production selectors and legacy files are removed.

- [ ] **Step 3: Switch sidebar outline to MarkDoc core**

Use Markdown outline data from `getEditorOutline(activeDocument.markdown)`. When clicking an item, call active editor adapter if registered; fallback to DOM query `[data-markdoc-outline-id="${id}"]` only inside `[data-markdoc-editor-root]`.

- [ ] **Step 4: Replace app-level editor selectors**

Change `src/main.tsx`, `src/pages/EditorPage.tsx`, and `src-tauri/src/lib.rs` from `.vditor` to `[data-markdoc-editor-root]`, `[data-markdoc-editor-content]`, or `contenteditable="true"` as appropriate.

- [ ] **Step 5: Delete legacy Vditor files and imports**

Remove the Vditor adapter, toolbar helper, Vditor color formatting helper, Vditor CSS import, Vditor stylesheet, and Vditor type declarations.

- [ ] **Step 6: Replace Vditor tests with MarkDoc behavior tests**

Delete tests that only assert Vditor internals. Keep or rewrite tests that assert product behavior: toolbar is MarkDoc-owned, color/background serialize, paste imports assets, remote resources are blocked in render, and adapter returns Markdown.

- [ ] **Step 7: Run cleanup guard and affected tests**

Run: `pnpm vitest run src/editor-core/__tests__/editor-contract.test.ts src/components/__tests__/Sidebar.test.tsx src/pages/__tests__/EditorPage.document-actions.test.tsx src/contexts/__tests__/DocumentContext.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src
git commit -m "refactor: remove Vditor editor path"
```

---

### Task 6: Full Verification, Desktop Smoke, And Final Review

**Files:**
- Modify only files required by failed checks.

**Interfaces:**
- Consumes: the complete replacement.
- Produces: verified branch ready to push.

- [ ] **Step 1: Run full unit/integration suite**

Run: `pnpm run ci`

Expected: release config, script tests, Vitest, lint, build, and Rust tests pass.

- [ ] **Step 2: Run Tauri desktop smoke**

Run: `pnpm tauri:dev`

Smoke checklist:

- Open a clean `.md`, type text, press `Cmd+S`, verify it saves in place without `.mdoc` suggestion.
- Paste a screenshot into a `.md`, verify it inserts `assets/...`, not a Base64 blob, and save offers `.mdoc`.
- Open an existing `.mdoc`, verify image render, edit, save, close, reopen.
- Import a `.docx` with media, verify image render via workspace URL, save as `.mdoc`, export DOCX.
- Open file dialog and folder sidebar do not hang.
- Outline click scrolls to the heading and pointer movement in editor does not jump to the top.
- Text color and background color apply in WYSIWYG and persist after save/reopen.
- Toolbar popovers are visible and clickable above the editor.

- [ ] **Step 3: Static search verification**

Run:

```bash
rg -n "vditor|Vditor|\\.vditor|vditor/dist|src/styles/vditor\\.css" src package.json vitest.config.ts
```

Expected: no production hits. Test names may mention historical migration only if they do not import or mock Vditor.

- [ ] **Step 4: Push after verification**

```bash
git status --short --branch
git push
```

If the push hits HTTP/2 framing errors, use:

```bash
git -c http.version=HTTP/1.1 push
```

---

## Self-Review

- Spec coverage: Tasks cover adapter contract, codec boundary, resource bridge, toolbar/popovers, outline, save-source preservation, i18n, Vditor deletion, and verification.
- Placeholder scan: no task uses `TBD`, `TODO`, `implement later`, or undefined future work as a requirement.
- Type consistency: `DocumentEditorAdapter`, `EditorCommand`, `EditorCommandAttrs`, and `MarkdownCodec` are defined in Task 1 and consumed by Tasks 2-5.
- Risk ruling: implementation is sequential for shared editor files; parallel work is limited to read-only exploration and final review because most write targets overlap.
