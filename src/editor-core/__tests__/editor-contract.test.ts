import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = process.cwd()
const productionRoots = [
  'src/components',
  'src/contexts',
  'src/hooks',
  'src/pages',
  'src/services',
  'src/editor-core',
]

function sourceFilesUnder(root: string): string[] {
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
}

function trackedSourceFiles() {
  return productionRoots.flatMap(sourceFilesUnder)
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
