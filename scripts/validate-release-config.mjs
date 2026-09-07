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

function requireNotIncludes(errors, label, source, expected, message) {
  if (source.includes(expected)) {
    errors.push(message || `${label} must not include ${expected}`)
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
    requireIncludes(errors, 'ci.yml', ci, 'pnpm run ci')
  }

  if (!await exists(releasePath)) {
    errors.push('.github/workflows/release.yml is missing')
    return
  }

  const release = await readText(releasePath)
  requireIncludes(errors, 'release.yml', release, 'tags:')
  requireIncludes(errors, 'release.yml', release, "'v*.*.*'")
  requireIncludes(errors, 'release.yml', release, 'contents: write')
  requireIncludes(errors, 'release.yml', release, 'concurrency:')
  requireIncludes(errors, 'release.yml', release, 'pnpm/action-setup@v4')
  requireIncludes(errors, 'release.yml', release, 'pnpm run release:check -- --release-version')
  requireIncludes(errors, 'release.yml', release, 'pnpm run ci')
  requireIncludes(errors, 'release.yml', release, 'needs: preflight')
  requireIncludes(errors, 'release.yml', release, 'tauri-apps/tauri-action@v1')
  requireIncludes(errors, 'release.yml', release, 'TAURI_SIGNING_PRIVATE_KEY')
  requireIncludes(errors, 'release.yml', release, 'TAURI_SIGNING_PRIVATE_KEY_PASSWORD')
  requireIncludes(errors, 'release.yml', release, 'releaseDraft: true')
  requireIncludes(errors, 'release.yml', release, 'verify-candidate:')
  requireIncludes(errors, 'release.yml', release, 'node scripts/validate-release-assets.mjs')
  requireIncludes(errors, 'release.yml', release, 'pnpm test:e2e')
  requireIncludes(errors, 'release.yml', release, 'ref: ${{ needs.preflight.outputs.sha }}')
  requireNotIncludes(errors, 'release.yml', release, '--draft=false', 'release.yml must not automatically publish candidate releases')
  requireNotIncludes(errors, 'release.yml', release, 'node scripts/sync-version.mjs', 'release.yml must not mutate source versions during publish')
  requireNotIncludes(errors, 'release.yml', release, 'releaseDraft: false', 'release.yml must publish installers as a draft before final release')
  if (!release.includes('releaseDraft: true')) {
    errors.push('release.yml must publish installers as a draft before final release')
  }
  if (!release.includes('pnpm run ci')) {
    errors.push('release.yml must run the full pnpm run ci preflight before publish')
  }
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

function releaseVersionTag(version) {
  return `v${version}`
}

function isStableReleaseTag(version) {
  return /^v\d+\.\d+\.\d+$/.test(version)
}

export async function validateReleaseConfig(root = process.cwd(), options = {}) {
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

  if (pkg.scripts?.['test:scripts'] !== 'node --test scripts/**/*.test.mjs') {
    errors.push('package.json must define test:scripts')
  }

  const expectedCiScript = 'pnpm run release:check && pnpm run test:scripts && pnpm test && pnpm run lint && pnpm run build:check && cargo test --manifest-path src-tauri/Cargo.toml'
  if (pkg.scripts?.ci !== expectedCiScript) {
    errors.push('package.json must define the full ci check')
  }

  const committedReleaseVersion = releaseVersionTag(pkg.version)
  if (options.releaseVersion !== undefined) {
    if (!isStableReleaseTag(options.releaseVersion)) {
      errors.push(`Release version ${options.releaseVersion} must be a stable SemVer tag like v1.2.3`)
    }
    if (options.releaseVersion !== committedReleaseVersion) {
      errors.push(`Release version ${options.releaseVersion} must match committed source version ${committedReleaseVersion}`)
    }
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
  const releaseVersionIndex = process.argv.indexOf('--release-version')
  const releaseVersion = releaseVersionIndex >= 0 ? process.argv[releaseVersionIndex + 1] : undefined
  const errors = await validateReleaseConfig(process.cwd(), { releaseVersion })
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
