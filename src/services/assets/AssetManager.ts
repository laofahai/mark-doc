export interface AssetRef {
  markdownPath: string
  absolutePath: string
  kind: 'image' | 'attachment' | 'data' | 'other'
  mimeType?: string
}

const MD_IMAGE_RE = /!\[[^\]]*\]\(([^)]+)\)/g
const HTML_IMG_RE = /<img\s[^>]*src=["']([^"']+)["'][^>]*>/g
const BASE64_IMAGE_RE = /data:image\/[a-zA-Z0-9.+-]+;base64,/i
const MD_BASE64_IMAGE_RE = /(!\[[^\]]*\]\()((?:data:image\/[a-zA-Z0-9.+-]+;base64,)[^)]+)(\))/gi
const HTML_TAG_RE = /<([a-z][a-z0-9-]*)\b[^>]*>/gi
const HTML_ATTR_RE = /([a-z_:][-a-z0-9_:.]*)\s*=\s*(["'])(.*?)\2/gi
const CSS_URL_RE = /url\(\s*(["']?)(.*?)\1\s*\)/gi
const MDOC_INLINE_BASE64_REFERENCE = 'inline-base64-image'
const HTML_RESOURCE_ATTRIBUTES: Record<string, string[]> = {
  audio: ['src'],
  embed: ['src'],
  iframe: ['src'],
  img: ['src', 'srcset'],
  input: ['src'],
  link: ['href'],
  object: ['data'],
  script: ['src'],
  source: ['src', 'srcset'],
  track: ['src'],
  video: ['src', 'poster'],
}

function isExternalReference(path: string) {
  return path.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(path)
}

function isPackageLocalReference(path: string) {
  return Boolean(path)
    && !path.startsWith('#')
    && !path.startsWith('/')
    && !path.startsWith('\\')
    && !path.includes('\\')
    && !path.split('/').includes('..')
    && !isExternalReference(path)
}

function cleanResourceReference(value: string) {
  return value.trim()
    .replace(/^<(.+)>$/, '$1')
    .replace(/^["'](.+)["']$/, '$1')
}

function addLocalReference(refs: Set<string>, value: string) {
  const path = cleanResourceReference(value)
  if (isPackageLocalReference(path)) refs.add(path)
}

function addSrcsetReferences(refs: Set<string>, value: string) {
  for (const candidate of value.split(',')) {
    const path = candidate.trim().split(/\s+/)[0]
    if (path) addLocalReference(refs, path)
  }
}

export function containsBase64Images(markdown: string) {
  return BASE64_IMAGE_RE.test(markdown)
}

export function findLocalAssetReferences(markdown: string) {
  const refs = new Set<string>()
  for (const re of [new RegExp(MD_IMAGE_RE), new RegExp(HTML_IMG_RE)]) {
    let match: RegExpExecArray | null
    while ((match = re.exec(markdown)) !== null) {
      addLocalReference(refs, match[1])
    }
  }

  let tagMatch: RegExpExecArray | null
  while ((tagMatch = HTML_TAG_RE.exec(markdown)) !== null) {
    const tagName = tagMatch[1].toLowerCase()
    const resourceAttributes = HTML_RESOURCE_ATTRIBUTES[tagName]
    if (!resourceAttributes) continue

    const attrs = tagMatch[0]
    let attrMatch: RegExpExecArray | null
    const attrRe = new RegExp(HTML_ATTR_RE)
    while ((attrMatch = attrRe.exec(attrs)) !== null) {
      const attrName = attrMatch[1].toLowerCase()
      if (!resourceAttributes.includes(attrName)) continue
      if (attrName === 'srcset') addSrcsetReferences(refs, attrMatch[3])
      else addLocalReference(refs, attrMatch[3])
    }
  }

  let cssMatch: RegExpExecArray | null
  const cssRe = new RegExp(CSS_URL_RE)
  while ((cssMatch = cssRe.exec(markdown)) !== null) {
    addLocalReference(refs, cssMatch[2])
  }

  return [...refs]
}

export function findPackageResourceReferences(markdown: string) {
  const refs = new Set<string>()
  if (containsBase64Images(markdown)) refs.add(MDOC_INLINE_BASE64_REFERENCE)
  for (const reference of findLocalAssetReferences(markdown)) refs.add(reference)
  return [...refs]
}

export function rewriteBase64ImageReferences(
  markdown: string,
  replacements: Record<string, string>,
) {
  return markdown.replace(MD_BASE64_IMAGE_RE, (match, prefix: string, dataUri: string, suffix: string) => {
    const replacement = replacements[dataUri]
    if (!replacement || isExternalReference(replacement)) return match
    return `${prefix}${replacement}${suffix}`
  })
}
