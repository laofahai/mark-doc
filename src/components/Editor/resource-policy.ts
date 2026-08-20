import type { PackageSecurityPolicy, RemoteResourceType } from '../../services/security/PackageSecurityPolicy'

const RESOURCE_ATTRIBUTES: Record<string, Array<{ attribute: string; type: RemoteResourceType }>> = {
  AUDIO: [{ attribute: 'src', type: 'other' }],
  EMBED: [{ attribute: 'src', type: 'other' }],
  IFRAME: [{ attribute: 'src', type: 'other' }],
  IMG: [{ attribute: 'src', type: 'image' }, { attribute: 'srcset', type: 'image' }],
  LINK: [{ attribute: 'href', type: 'style' }],
  OBJECT: [{ attribute: 'data', type: 'other' }],
  SCRIPT: [{ attribute: 'src', type: 'script' }],
  SOURCE: [{ attribute: 'src', type: 'other' }, { attribute: 'srcset', type: 'other' }],
  VIDEO: [{ attribute: 'src', type: 'other' }, { attribute: 'poster', type: 'image' }],
}

function policyUrl(value: string) {
  const trimmed = value.trim().replace(/^['"]|['"]$/g, '')
  if (trimmed.startsWith('//')) return `https:${trimmed}`
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : null
}

function cssUrls(css: string) {
  const urls: string[] = []
  const pattern = /url\(\s*(['"]?)([^)'"\s]+)\1\s*\)|@import\s+(?:url\(\s*)?(['"])([^'"]+)\3/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(css)) !== null) urls.push(match[2] || match[4])
  return urls
}

function blocksValue(value: string, type: RemoteResourceType, policy: PackageSecurityPolicy) {
  const url = policyUrl(value)
  return url !== null && !policy.canLoadRemote(url, type)
}

function markerName(attribute: string) {
  return `data-markdoc-original-${attribute}`
}

function blockAttribute(element: Element, attribute: string, replacement?: string) {
  const value = element.getAttribute(attribute)
  if (value !== null && !element.hasAttribute(markerName(attribute))) {
    element.setAttribute(markerName(attribute), value)
  }
  if (replacement === undefined) element.removeAttribute(attribute)
  else element.setAttribute(attribute, replacement)
}

function enforceElement(element: Element, policy: PackageSecurityPolicy) {
  for (const resource of RESOURCE_ATTRIBUTES[element.tagName] ?? []) {
    const value = element.getAttribute(resource.attribute)
    if (!value) continue
    if (resource.attribute === 'srcset') {
      const allowed = value.split(',').filter(candidate => !blocksValue(candidate.trim().split(/\s+/)[0], resource.type, policy))
      if (allowed.length === 0) blockAttribute(element, resource.attribute)
      else if (allowed.length !== value.split(',').length) blockAttribute(element, resource.attribute, allowed.join(','))
      continue
    }
    if (blocksValue(value, resource.type, policy)) blockAttribute(element, resource.attribute)
  }

  const inlineStyle = element.getAttribute('style')
  if (inlineStyle && cssUrls(inlineStyle).some(url => blocksValue(url, 'style', policy))) {
    blockAttribute(element, 'style')
  }

  if (element.tagName === 'STYLE') {
    const css = element.textContent ?? ''
    const type: RemoteResourceType = /@font-face/i.test(css) ? 'font' : 'style'
    if (cssUrls(css).some(url => blocksValue(url, type, policy))) {
      if (!element.hasAttribute('data-markdoc-original-text')) {
        element.setAttribute('data-markdoc-original-text', css)
      }
      element.textContent = ''
    }
  }
}

export function enforceRemoteResourcePolicy(root: ParentNode, policy: PackageSecurityPolicy | null | undefined) {
  if (!policy) return
  if (root instanceof Element) enforceElement(root, policy)
  root.querySelectorAll('*').forEach(element => enforceElement(element, policy))
}

export function sanitizeRenderedHtml(html: string, policy: PackageSecurityPolicy | null | undefined) {
  if (!policy) return html
  const template = document.createElement('template')
  template.innerHTML = html
  enforceRemoteResourcePolicy(template.content, policy)
  return template.innerHTML
}

export function restoreBlockedResources(root: ParentNode) {
  const elements = root instanceof Element ? [root, ...root.querySelectorAll('*')] : [...root.querySelectorAll('*')]
  for (const element of elements) {
    for (const attribute of ['src', 'srcset', 'href', 'data', 'poster', 'style']) {
      const marker = markerName(attribute)
      const original = element.getAttribute(marker)
      if (original === null) continue
      element.setAttribute(attribute, original)
      element.removeAttribute(marker)
    }
    const originalText = element.getAttribute('data-markdoc-original-text')
    if (originalText !== null) {
      element.textContent = originalText
      element.removeAttribute('data-markdoc-original-text')
    }
  }
}

interface VditorInternals {
  currentMode: 'wysiwyg' | 'ir' | 'sv'
  wysiwyg: { element: HTMLElement }
  ir: { element: HTMLElement }
  lute: {
    VditorDOM2Md(html: string): string
    VditorIRDOM2Md(html: string): string
    Md2VditorDOM?(markdown: string): string
    Md2VditorIRDOM?(markdown: string): string
    SpinVditorDOM?(html: string): string
    SpinVditorIRDOM?(html: string): string
  }
}

export function installRemoteResourceRenderBoundary(
  editor: { getValue(): string },
  currentPolicy: () => PackageSecurityPolicy | null | undefined,
) {
  const internals = (editor as unknown as { vditor?: VditorInternals }).vditor
  if (!internals) return
  for (const method of ['Md2VditorDOM', 'Md2VditorIRDOM', 'SpinVditorDOM', 'SpinVditorIRDOM'] as const) {
    const original = internals.lute[method]
    if (!original) continue
    internals.lute[method] = ((value: string) => sanitizeRenderedHtml(original.call(internals.lute, value), currentPolicy())) as never
  }
}

export function getCanonicalEditorMarkdown(editor: { getValue(): string }) {
  const internals = (editor as unknown as { vditor?: VditorInternals }).vditor
  if (!internals || internals.currentMode === 'sv') return editor.getValue()
  const source = internals.currentMode === 'wysiwyg' ? internals.wysiwyg.element : internals.ir.element
  const clone = source.cloneNode(true) as HTMLElement
  restoreBlockedResources(clone)
  return internals.currentMode === 'wysiwyg'
    ? internals.lute.VditorDOM2Md(clone.innerHTML)
    : internals.lute.VditorIRDOM2Md(clone.innerHTML)
}

export function observeRemoteResourcePolicy(
  root: HTMLElement,
  currentPolicy: () => PackageSecurityPolicy | null | undefined,
) {
  enforceRemoteResourcePolicy(root, currentPolicy())
  const observer = new MutationObserver(records => {
    const policy = currentPolicy()
    if (!policy) return
    for (const record of records) {
      if (record.type === 'attributes') {
        enforceRemoteResourcePolicy(record.target as Element, policy)
        continue
      }
      record.addedNodes.forEach(node => {
        if (node instanceof Element) enforceRemoteResourcePolicy(node, policy)
        else if (node.parentElement) enforceRemoteResourcePolicy(node.parentElement, policy)
      })
    }
  })
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['src', 'srcset', 'href', 'data', 'poster', 'style'],
  })
  return () => observer.disconnect()
}
