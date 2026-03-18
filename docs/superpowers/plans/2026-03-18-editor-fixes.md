# MarkDoc Editor Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all accumulated UX/UI issues — Vditor toolbar with proper styling, close dialog, layout cleanup, title bar integration.

**Architecture:** Vditor keeps its built-in toolbar (hidden via CSS), we overlay our own lucide-icon toolbar that triggers Vditor toolbar button clicks via DOM. Close confirmation uses desktop-core Dialog. Layout consolidates to: Shell TitleBar (brand + filename) → Tab bar → Vditor (with native toolbar styled via CSS) → Editor content.

**Tech Stack:** Vditor, React, Tailwind 4, @linch-tech/desktop-core (Dialog, DropdownMenu, Tooltip, Separator), lucide-react

---

### Task 1: Fix Vditor toolbar — keep native but restyle with CSS

The key insight: Vditor's toolbar buttons work correctly out of the box. Instead of hiding them and rebuilding, we keep them but heavily restyle with CSS to match our app. This avoids all the API/command issues.

**Files:**
- Modify: `src/components/Editor/Editor.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: Update Editor to use full Vditor toolbar with pin**

In `src/components/Editor/Editor.tsx`, set the toolbar config:

```typescript
toolbar: [
  'headings', 'bold', 'italic', 'strike', '|',
  'quote', 'list', 'ordered-list', 'check', 'outdent', 'indent', '|',
  'code', 'inline-code', 'link', 'table', 'upload', '|',
  'line', 'emoji', '|',
  'undo', 'redo', '|',
  'edit-mode', 'outline', 'fullscreen', 'export',
],
toolbarConfig: { pin: true },
```

Remove the `execCommand` from `EditorHandle` since we no longer need it. Remove `forwardRef` and `useImperativeHandle`. Simplify to just exposing `getInstance`.

- [ ] **Step 2: Restyle Vditor toolbar in CSS**

Replace all Vditor toolbar CSS in `src/index.css` with:

```css
/* Vditor 样式覆盖 */
.vditor {
  border: none !important;
  background: transparent !important;
}
.vditor-reset {
  padding: 24px 32px !important;
}
.vditor-ir, .vditor-wysiwyg, .vditor-sv {
  border: none !important;
}
.vditor .vditor-content {
  border: none !important;
}

/* Toolbar */
.vditor-toolbar {
  background: var(--background) !important;
  border-bottom: 1px solid var(--border) !important;
  padding: 3px 12px !important;
  min-height: auto !important;
}
.vditor-toolbar--hide {
  display: none !important;
}
.vditor-toolbar__item {
  margin: 0 !important;
}
.vditor-toolbar__item button,
.vditor-toolbar__item > span {
  padding: 5px 7px !important;
  height: auto !important;
  border-radius: 6px !important;
  color: var(--muted-foreground) !important;
  transition: all 0.15s !important;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}
.vditor-toolbar__item button:hover,
.vditor-toolbar__item > span:hover {
  background: var(--accent) !important;
  color: var(--foreground) !important;
}
.vditor-toolbar__item--current button {
  color: var(--foreground) !important;
  background: var(--accent) !important;
}
.vditor-toolbar__item button svg {
  height: 16px !important;
  width: 16px !important;
}
.vditor-toolbar__divider {
  height: 18px !important;
  margin: 0 6px !important;
  border-left-color: var(--border) !important;
}
/* Toolbar panels/dropdowns */
.vditor-toolbar .vditor-panel--left,
.vditor-toolbar .vditor-panel--arrow {
  border: 1px solid var(--border) !important;
  border-radius: 8px !important;
  box-shadow: 0 4px 12px rgba(0,0,0,0.08) !important;
  background: var(--background) !important;
}
/* Counter at bottom */
.vditor-counter {
  display: none !important;
}
```

- [ ] **Step 3: Build and verify**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/components/Editor/Editor.tsx src/index.css
git commit -m "feat: restyle Vditor native toolbar with app theme"
```

---

### Task 2: Simplify EditorPage — remove custom toolbar, clean layout

**Files:**
- Modify: `src/pages/EditorPage.tsx`

- [ ] **Step 1: Rewrite EditorPage**

Remove:
- All custom toolbar buttons (TBtn, Bold, Italic, etc.)
- `editorRef` and `execCommand` calls
- Mode/width dropdowns from tab bar (moved to Vditor toolbar via `edit-mode`)

Keep:
- Tab bar (pure tabs + right side: file dropdown, save dropdown)
- Editor area with page width constraint
- Empty state
- Word count capsule
- Keyboard shortcuts (Ctrl+S, Ctrl+W, Ctrl+N)
- Ctrl+scroll zoom

Tab bar right side has just 3 icon buttons:
1. File operations dropdown (FilePlus icon) — new, open, open folder, recent
2. Save dropdown (Save icon) — save, export .md, export .docx
3. Page width dropdown (AlignJustify icon) — normal, wide, full

Remove `mode` and `onModeChange` props — Vditor handles mode switching internally via its `edit-mode` toolbar button.

- [ ] **Step 2: Update App.tsx to remove mode state**

Remove `mode`/`setMode` state and props from `AppShell` and `EditorPage`.

- [ ] **Step 3: Build and verify**

Run: `pnpm build`

- [ ] **Step 4: Commit**

```bash
git add src/pages/EditorPage.tsx src/App.tsx
git commit -m "refactor: simplify EditorPage, use Vditor native toolbar"
```

---

### Task 3: Custom close confirmation dialog

**Files:**
- Create: `src/components/CloseConfirmDialog.tsx`
- Modify: `src/pages/EditorPage.tsx`

- [ ] **Step 1: Create CloseConfirmDialog component**

Using desktop-core Dialog components:

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Button } from '@linch-tech/desktop-core'

interface Props {
  open: boolean
  fileName: string
  onClose: () => void
  onDiscard: () => void
  onSave: () => void
}

export function CloseConfirmDialog({ open, fileName, onClose, onDiscard, onSave }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>未保存的更改</DialogTitle>
          <DialogDescription>"{fileName}" 有未保存的更改，是否保存？</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="outline" onClick={onDiscard}>不保存</Button>
          <Button onClick={onSave}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Replace window.confirm in EditorPage**

In `handleCloseTab`, instead of `window.confirm`, set state to show the dialog:

```typescript
const [closeConfirm, setCloseConfirm] = useState<{ id: string; name: string } | null>(null)

const handleCloseTab = useCallback((id: string) => {
  const tab = tabs.find(t => t.id === id)
  if (tab?.isDirty) {
    setCloseConfirm({ id, name: tab.name })
    return
  }
  closeTab(id)
}, [tabs, closeTab])
```

Render the dialog in JSX with handlers for discard (just close tab) and save (save then close).

- [ ] **Step 3: Build and verify**

Run: `pnpm build`

- [ ] **Step 4: Commit**

```bash
git add src/components/CloseConfirmDialog.tsx src/pages/EditorPage.tsx
git commit -m "feat: custom close confirmation dialog"
```

---

### Task 4: Title bar — brand + filename in Shell slots

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Verify TitleLeft works with context**

The current `TitleLeft` component uses `useFile()` inside Shell titleBar slots. Since `FileProvider` wraps `LinchDesktopProvider`, and Shell renders the slot JSX within the provider tree, context should work. If it doesn't, move the brand+filename display into EditorPage instead (as a first row before tabs).

Test: Open a file and check if the filename appears in the title bar.

- [ ] **Step 2: If titleBar slots don't work with context, fallback**

Move brand+filename into EditorPage as first element, remove `slots.titleBar` from config.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "fix: title bar brand and filename display"
```

---

### Task 5: Layout cleanup — backgrounds, borders, visual polish

**Files:**
- Modify: `src/index.css`
- Modify: `src/pages/EditorPage.tsx`

- [ ] **Step 1: Remove background differences**

In EditorPage tab bar, remove any `bg-muted/30` or similar background classes. All bars should be `bg-background` (transparent, inheriting from parent).

- [ ] **Step 2: Clean up Shell sidebar CSS overrides**

Keep the sidebar CSS overrides in `index.css` but ensure they're minimal and well-commented.

- [ ] **Step 3: Ensure Vditor has no stray borders/backgrounds**

The CSS from Task 1 should handle this. Verify `.vditor`, `.vditor-content`, `.vditor-ir`, `.vditor-wysiwyg`, `.vditor-sv` all have `border: none` and `background: transparent`.

- [ ] **Step 4: Build and verify**

Run: `pnpm build`

- [ ] **Step 5: Commit**

```bash
git add src/index.css src/pages/EditorPage.tsx
git commit -m "fix: remove background differences and stray borders"
```

---

### Task 6: Final integration test

- [ ] **Step 1: Run full build**

```bash
pnpm build
```

- [ ] **Step 2: Run tests**

```bash
pnpm test
```

- [ ] **Step 3: Start Tauri and manual verification**

```bash
pnpm tauri:dev
```

Verify:
- [ ] Vditor toolbar renders with app-themed styling
- [ ] All toolbar buttons work (bold, italic, heading, etc.)
- [ ] Edit mode switching works (via Vditor's edit-mode button)
- [ ] Tab bar shows/hides correctly
- [ ] File open/save/export work
- [ ] Close confirmation uses custom dialog
- [ ] Title bar shows brand name + filename
- [ ] No background color differences between bars
- [ ] No stray borders on editor
- [ ] Ctrl+S/W/N shortcuts work
- [ ] Ctrl+scroll zoom works
- [ ] Hover over editor gets focus
- [ ] Word count capsule shows

- [ ] **Step 4: Commit final state**

```bash
git add -A
git commit -m "fix: all accumulated editor UX issues"
```
