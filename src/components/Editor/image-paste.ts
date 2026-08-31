interface ClipboardItemLike {
  kind: string
  type: string
  getAsFile: () => File | null
}

interface ClipboardDataLike {
  items?: ArrayLike<ClipboardItemLike>
  files?: ArrayLike<File>
  types?: ArrayLike<string>
}

interface PasteEventLike {
  clipboardData?: ClipboardDataLike | null
  preventDefault: () => void
  stopPropagation?: () => void
  stopImmediatePropagation?: () => void
}

export type ImportPastedImage = (file: File) => Promise<string | null | undefined>

const IMAGE_EXTENSION_PATTERN = /\.(apng|bmp|gif|ico|cur|jpe?g|jfif|pjpeg|pjp|png|svg|webp)$/i
const WEBKIT_IMAGE_TYPE_PATTERN = /^public\.(png|jpeg|jpg|gif|tiff|webp)$/i
const DATA_IMAGE_PATTERN = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/

function isImageFile(file: File, fallbackType = '') {
  return file.type.startsWith('image/')
    || fallbackType.startsWith('image/')
    || WEBKIT_IMAGE_TYPE_PATTERN.test(fallbackType)
    || IMAGE_EXTENSION_PATTERN.test(file.name)
}

function pastedImageFile(event: PasteEventLike) {
  const items = Array.from(event.clipboardData?.items ?? [])
  for (const item of items) {
    if (item.kind !== 'file') continue
    const file = item.getAsFile()
    if (file && isImageFile(file, item.type)) return file
  }
  const files = Array.from(event.clipboardData?.files ?? [])
  for (const file of files) {
    if (isImageFile(file)) return file
  }
  return null
}

export function describeClipboardData(event: PasteEventLike) {
  return {
    itemCount: event.clipboardData?.items?.length ?? 0,
    items: Array.from(event.clipboardData?.items ?? []).map(item => ({
      kind: item.kind,
      type: item.type,
      hasFile: Boolean(item.getAsFile()),
      fileName: item.getAsFile()?.name ?? '',
      fileType: item.getAsFile()?.type ?? '',
    })),
    fileCount: event.clipboardData?.files?.length ?? 0,
    files: Array.from(event.clipboardData?.files ?? []).map(file => ({
      name: file.name,
      type: file.type,
      size: file.size,
    })),
    types: Array.from(event.clipboardData?.types ?? []),
  }
}

export async function handleEditorImagePaste(
  event: PasteEventLike,
  importImage: ImportPastedImage,
  insertValue: (markdown: string) => void,
) {
  const file = pastedImageFile(event)
  if (!file) return false

  event.preventDefault()
  event.stopPropagation?.()
  event.stopImmediatePropagation?.()
  const assetPath = await importImage(file)
  if (!assetPath) return true

  insertValue(`![image](${assetPath})`)
  return true
}

export async function importEditorUploadFiles(
  files: File[],
  importImage: ImportPastedImage,
  insertValue: (markdown: string) => void,
) {
  for (const file of files) {
    if (!isImageFile(file)) continue
    const assetPath = await importImage(file)
    if (assetPath) insertValue(`![image](${assetPath})`)
  }
  return null
}

function extensionForMimeType(mimeType: string) {
  return mimeType === 'image/jpeg' ? 'jpg'
    : mimeType === 'image/svg+xml' ? 'svg'
      : mimeType.split('/')[1]?.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png'
}

function base64ToBytes(base64: string) {
  const binary = atob(base64.replace(/\s/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export async function importEditorDataImage(
  dataUri: string,
  importImage: ImportPastedImage,
) {
  const match = dataUri.match(DATA_IMAGE_PATTERN)
  if (!match) return dataUri

  const mimeType = match[1]
  const bytes = base64ToBytes(match[2])
  const file = new File([bytes], `pasted.${extensionForMimeType(mimeType)}`, { type: mimeType })
  return await importImage(file) || dataUri
}
