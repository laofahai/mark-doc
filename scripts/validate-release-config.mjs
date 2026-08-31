import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

async function readText(path) {
  return readFile(path, 'utf8')
}

async function readJson(path) {
  return JSON.parse(await readText(path))
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function requireIncludes(errors, label, source, expected) {
  if (!source.includes(expected)) {
    errors.push(`${label} must include ${expected}`)
  }
}

function rejectReadmeInternals(errors, label, source) {
  const internalMarkers = [
    '.github/workflows',
    'TAURI_SIGNING_PRIVATE_KEY',
    'TAURI_SIGNING_PRIVATE_KEY_PASSWORD',
    'release:check',
    'tauri-apps/tauri-action',
  ]

  if (internalMarkers.some((marker) => source.includes(marker))) {
    errors.push(`${label} must not include maintainer release internals`)
  }
}

function requireReadmeMdocPositioning(errors, label, source, mainFormatText) {
  const opening = source.split(/\n##\s+/u)[0] ?? source

  if (!opening.includes('`.mdoc`')) {
    errors.push(`${label} must introduce .mdoc before the first section`)
  }

  if (!source.includes(mainFormatText)) {
    errors.push(`${label} must state that .mdoc is the main file format`)
  }
}

async function validateReadmeLinks(root, errors) {
  const readmePath = join(root, 'README.md')
  const zhReadmePath = join(root, 'README.zh-CN.md')

  if (!await exists(readmePath)) {
    errors.push('README.md is missing')
    return
  }

  if (!await exists(zhReadmePath)) {
    errors.push('README.zh-CN.md is missing')
    return
  }

  const readme = await readText(readmePath)
  const zhReadme = await readText(zhReadmePath)

  requireIncludes(errors, 'README.md', readme, 'README.zh-CN.md')
  requireIncludes(errors, 'README.zh-CN.md', zhReadme, 'README.md')
  requireReadmeMdocPositioning(errors, 'README.md', readme, "main file format is `.mdoc`")
  requireReadmeMdocPositioning(errors, 'README.zh-CN.md', zhReadme, '主文件格式是 `.mdoc`')
  rejectReadmeInternals(errors, 'README.md', readme)
  rejectReadmeInternals(errors, 'README.zh-CN.md', zhReadme)
}

async function validateWorkflow(root, errors) {
  const ciPath = join(root, '.github/workflows/ci.yml')
  const releasePath = join(root, '.github/workflows/release.yml')

  if (!await exists(ciPath)) {
    errors.push('.github/workflows/ci.yml is missing')
  } else {
    const ci = await readText(ciPath)
    requireIncludes(errors, 'ci.yml', ci, 'pnpm/action-setup@v4')
    requireIncludes(errors, 'ci.yml', ci, 'pnpm run release:check')
    requireIncludes(errors, 'ci.yml', ci, 'pnpm test')
    requireIncludes(errors, 'ci.yml', ci, 'pnpm run lint')
    requireIncludes(errors, 'ci.yml', ci, 'pnpm run build:check')
    requireIncludes(errors, 'ci.yml', ci, 'cargo test')
  }

  if (!await exists(releasePath)) {
    errors.push('.github/workflows/release.yml is missing')
    return
  }

  const release = await readText(releasePath)
  requireIncludes(errors, 'release.yml', release, 'tags:')
  requireIncludes(errors, 'release.yml', release, "'v*.*.*'")
  requireIncludes(errors, 'release.yml', release, 'contents: write')
  requireIncludes(errors, 'release.yml', release, 'pnpm/action-setup@v4')
  requireIncludes(errors, 'release.yml', release, 'node scripts/sync-version.mjs')
  requireIncludes(errors, 'release.yml', release, 'tauri-apps/tauri-action@v1')
  requireIncludes(errors, 'release.yml', release, 'TAURI_SIGNING_PRIVATE_KEY')
  requireIncludes(errors, 'release.yml', release, 'TAURI_SIGNING_PRIVATE_KEY_PASSWORD')
  requireIncludes(errors, 'release.yml', release, 'releaseDraft: false')
}

async function validateMaintainerDocs(root, errors) {
  const releaseDocsPath = join(root, 'docs/release.md')
  if (!await exists(releaseDocsPath)) {
    errors.push('docs/release.md is missing')
    return
  }

  const releaseDocs = await readText(releaseDocsPath)
  requireIncludes(errors, 'docs/release.md', releaseDocs, 'TAURI_SIGNING_PRIVATE_KEY')
  requireIncludes(errors, 'docs/release.md', releaseDocs, 'latest.json')
}

export async function validateReleaseConfig(root = process.cwd()) {
  const errors = []
  const pkg = await readJson(join(root, 'package.json'))
  const tauri = await readJson(join(root, 'src-tauri/tauri.conf.json'))
  const cargo = await readText(join(root, 'src-tauri/Cargo.toml'))
  const cargoVersion = cargo.match(/^\s*version\s*=\s*"([^"]+)"/m)?.[1]

  if (pkg.version !== tauri.version || pkg.version !== cargoVersion) {
    errors.push(`Versions must match: package.json=${pkg.version}, tauri.conf.json=${tauri.version}, Cargo.toml=${cargoVersion ?? 'missing'}`)
  }

  if (!String(pkg.packageManager ?? '').startsWith('pnpm@')) {
    errors.push('packageManager must pin pnpm')
  }

  if (pkg.scripts?.['version:sync'] !== 'node scripts/sync-version.mjs') {
    errors.push('package.json must define version:sync')
  }

  if (pkg.scripts?.['release:check'] !== 'node scripts/validate-release-config.mjs') {
    errors.push('package.json must define release:check')
  }

  if (tauri.bundle?.createUpdaterArtifacts !== true) {
    errors.push('src-tauri/tauri.conf.json bundle.createUpdaterArtifacts must be true')
  }

  const updater = tauri.plugins?.updater
  if (!updater?.pubkey || typeof updater.pubkey !== 'string') {
    errors.push('src-tauri/tauri.conf.json plugins.updater.pubkey is missing')
  }

  const expectedEndpoint = 'https://github.com/laofahai/mark-doc/releases/latest/download/latest.json'
  if (!Array.isArray(updater?.endpoints) || !updater.endpoints.includes(expectedEndpoint)) {
    errors.push(`src-tauri/tauri.conf.json plugins.updater.endpoints must include ${expectedEndpoint}`)
  }

  await validateWorkflow(root, errors)
  await validateReadmeLinks(root, errors)
  await validateMaintainerDocs(root, errors)

  return errors
}

async function main() {
  const errors = await validateReleaseConfig(process.cwd())
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`- ${error}`)
    }
    process.exit(1)
  }

  console.log('Release configuration is valid')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
