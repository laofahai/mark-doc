import { createRoot } from 'react-dom/client'
import { useEffect, useRef, useState } from 'react'
import { EditorShell } from '../../src/components/Editor/EditorShell'
import type { DocumentEditorAdapter } from '../../src/components/Editor/editor-adapter'
import { getSidebarOutline } from '../../src/components/sidebar-outline'
import { VirtualOutlineList } from '../../src/components/VirtualOutlineList'
import { DEFAULT_PAGE_LAYOUT } from '../../src/services/document/page-layout'
import '../../src/index.css'
import '../../src/styles/editor.css'
import '../../src/styles/editor-tables.css'

const query = new URLSearchParams(window.location.search)
const rawContent = query.has('manyheadings')
  ? Array.from({ length: 20_000 }, (_, index) => `## Heading ${index + 1}\n\nText\n\n`).join('')
  : query.has('table')
  ? '# Table widths\n\n| Name | Description |\n| --- | --- |\n| Alpha | First value |\n| Beta | Second value |'
  : query.has('huge')
  ? ['# Huge document', ...Array.from({ length: 19_997 }, (_, index) => `Line ${index + 1}. `.padEnd(104, 'x')), '## Final huge heading', 'HUGE_DOCUMENT_END_SENTINEL'].join('\n')
  : query.has('large')
  ? '# Large document\n\n' + Array.from({ length: 2000 }, (_, index) => `Paragraph ${index + 1}. Document content for the browser interaction regression.\n\n`).join('')
  : query.has('interactions')
  ? '# First\n\n\nStart here.\n\n' + 'Document paragraph.\n\n'.repeat(60) + '## Target\n\nEnd section.\n\n' + 'Final paragraph.\n\n'.repeat(30)
  : '# Document layout\n\n' + 'The document keeps the same paper size and line wrapping while the available canvas changes. '.repeat(30)
const content = query.has('crlf') ? rawContent.replaceAll('\n', '\r\n') : rawContent
let imageUrl = ''

declare global {
  interface Window {
    markdocFixture?: {
      getMarkdown: () => string
      originalMarkdown: string
      reload: () => void
      loadExternal: (markdown: string) => void
      changes: () => number
    }
  }
}

function Fixture() {
  const [adapter, setAdapter] = useState<DocumentEditorAdapter | null>(null)
  const [markdown, setMarkdown] = useState(content)
  const changes = useRef(0)
  const items = getSidebarOutline(markdown)
  const renderHeading = (item: (typeof items)[number]) => <button key={item.id} style={{ display: 'block', height: 28 }} disabled={!adapter} data-target={item.id} onClick={event => { event.currentTarget.dataset.located = String(adapter?.scrollToOutlineItem(item.id)) }}>{item.text}</button>
  useEffect(() => {
    if (!adapter) return
    window.markdocFixture = { getMarkdown: () => adapter.getMarkdown(), originalMarkdown: content, reload: () => adapter.setMarkdown(adapter.getMarkdown()), loadExternal: setMarkdown, changes: () => changes.current }
    return () => { delete window.markdocFixture }
  }, [adapter])
  return <div data-editor-ready={adapter !== null} style={{ display: 'flex', height: '100%' }}>
    {(query.has('interactions') || query.has('huge') || query.has('manyheadings')) && <nav style={{ width: 160, flexShrink: 0 }}>
      {items.length > 200 ? <VirtualOutlineList items={items} renderItem={renderHeading} /> : items.map(renderHeading)}
    </nav>}
    <div style={{ flex: 1, minWidth: 0 }}>
      <EditorShell
        content={markdown}
        onChange={value => { changes.current += 1; setMarkdown(value) }}
        onAdapterReady={setAdapter}
        onImagePaste={async file => { imageUrl = URL.createObjectURL(file); return 'assets/paste.png' }}
        resolveAssetUrl={() => imageUrl}
        viewMode="fit"
        zoom={Number(query.get('zoom') ?? 100)}
        pageLayout={{ ...DEFAULT_PAGE_LAYOUT, orientation: query.has('landscape') ? 'landscape' : 'portrait' }}
      />
    </div>
  </div>
}
createRoot(document.getElementById('root')!).render(
  <Fixture />,
)
