import { getSchema, type Extensions, type JSONContent } from '@tiptap/core'
import { DOMSerializer, type Schema } from '@tiptap/pm/model'

export function tableNeedsHtml(node: JSONContent): boolean {
  return node.content?.some(row => row.content?.some(cell => {
    const { colwidth, colspan, rowspan } = cell.attrs ?? {}
    return (Array.isArray(colwidth) && colwidth.some(width => typeof width === 'number' && width > 0))
      || (typeof colspan === 'number' && colspan > 1)
      || (typeof rowspan === 'number' && rowspan > 1)
      || cell.content?.some(child => child.type === 'table' && tableNeedsHtml(child))
  })) ?? false
}

export function createTableHtmlSerializer(extensions: () => Extensions) {
  let schema: Schema | undefined
  let serializer: DOMSerializer | undefined
  return (node: JSONContent) => {
    schema ??= getSchema(extensions())
    serializer ??= DOMSerializer.fromSchema(schema)
    // Serialize the document model, never the live DOM with resolved asset URLs.
    const container = document.createElement('div')
    container.appendChild(serializer.serializeNode(schema.nodeFromJSON(node)))
    return container.innerHTML
  }
}
