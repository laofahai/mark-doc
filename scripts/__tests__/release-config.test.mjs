import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { syncVersionInDirectory } from '../sync-version.mjs'
import { validateReleaseConfig } from '../validate-release-config.mjs'

async function writeFixtureProject() {
  const root = await mkdtemp(join(tmpdir(), 'markdoc-release-config-'))
  await mkdir(join(root, 'src-tauri'), { recursive: true })
  await mkdir(join(root, '.github/workflows'), { recursive: true })

  await writeFile(join(root, 'package.json'), `${JSON.stringify({
    name: 'mark-doc',
    version: '0.1.0',
    packageManager: 'pnpm@10.32.1',
    scripts: {
      'release:check': 'node scripts/validate-release-config.mjs',
      'version:sync': 'node scripts/sync-version.mjs',
    },
  }, null, 2)}\n`)
  await writeFile(join(root, 'src-tauri/Cargo.toml'), '[package]\nname = "mark-doc"\nversion = "0.1.0"\n')
  await writeFile(join(root, 'src-tauri/tauri.conf.json'), `${JSON.stringify({
    productName: 'MarkDoc',
    version: '0.1.0',
    bundle: {
      active: true,
      targets: 'all',
      createUpdaterArtifacts: true,
    },
    plugins: {
      updater: {
        pubkey: 'PUBLIC_KEY',
        endpoints: ['https://github.com/laofahai/mark-doc/releases/latest/download/latest.json'],
      },
    },
  }, null, 2)}\n`)
  await writeFile(join(root, '.github/workflows/ci.yml'), [
    'name: CI',
    'jobs:',
    '  validate:',
    '    steps:',
    '      - uses: pnpm/action-setup@v4',
    '      - run: pnpm run release:check',
    '      - run: pnpm test',
    '      - run: pnpm run lint',
    '      - run: pnpm run build:check',
    '      - run: cargo test',
    '',
  ].join('\n'))
  await writeFile(join(root, '.github/workflows/release.yml'), [
    'name: Release',
    'on:',
    '  push:',
    '    tags:',
    "      - 'v*.*.*'",
    'permissions:',
    '  contents: write',
    'jobs:',
    '  publish:',
    '    strategy:',
    '      matrix:',
    '        platform: [macos-latest, ubuntu-22.04, windows-latest]',
    '    steps:',
    '      - uses: pnpm/action-setup@v4',
    '      - run: node scripts/sync-version.mjs ${{ github.ref_name }}',
    '      - uses: tauri-apps/tauri-action@v1',
    '        with:',
    '          releaseDraft: false',
    '        env:',
    '          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}',
    '          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}',
    '          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}',
    '',
  ].join('\n'))
  await writeFile(join(root, 'README.md'), [
    '# MarkDoc',
    '',
    '`.mdoc`-first desktop document editing.',
    '',
    '[中文](README.zh-CN.md)',
    '',
    "MarkDoc's main file format is `.mdoc`.",
    '',
  ].join('\n'))
  await writeFile(join(root, 'README.zh-CN.md'), [
    '# MarkDoc',
    '',
    '以 `.mdoc` 为主格式的桌面文档编辑器。',
    '',
    '[English](README.md)',
    '',
    'MarkDoc 的主文件格式是 `.mdoc`。',
    '',
  ].join('\n'))
  await mkdir(join(root, 'docs'), { recursive: true })
  await writeFile(join(root, 'docs/release.md'), '# Release Runbook\n\nTAURI_SIGNING_PRIVATE_KEY\nlatest.json\n')
  return root
}

describe('release configuration', () => {
  it('syncs tag versions across package, Cargo and Tauri config', async () => {
    const root = await writeFixtureProject()
    try {
      await syncVersionInDirectory(root, 'v0.2.3')

      const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
      const tauri = JSON.parse(await readFile(join(root, 'src-tauri/tauri.conf.json'), 'utf8'))
      const cargo = await readFile(join(root, 'src-tauri/Cargo.toml'), 'utf8')

      assert.equal(pkg.version, '0.2.3')
      assert.equal(tauri.version, '0.2.3')
      assert.match(cargo, /^version = "0\.2\.3"$/m)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('accepts the release setup required for updater-backed GitHub releases', async () => {
    const root = await writeFixtureProject()
    try {
      assert.deepEqual(await validateReleaseConfig(root), [])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('keeps maintainer release internals out of user-facing readmes', async () => {
    const root = await writeFixtureProject()
    try {
      await writeFile(join(root, 'README.md'), '# MarkDoc\n\n[中文](README.zh-CN.md)\n\nTAURI_SIGNING_PRIVATE_KEY\n')

      const errors = await validateReleaseConfig(root)

      assert.ok(errors.includes('README.md must not include maintainer release internals'))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('keeps .mdoc product positioning in the user-facing readmes', async () => {
    const root = await writeFixtureProject()
    try {
      await writeFile(join(root, 'README.md'), '# MarkDoc\n\n[中文](README.zh-CN.md)\n')

      const errors = await validateReleaseConfig(root)

      assert.ok(errors.includes('README.md must introduce .mdoc before the first section'))
      assert.ok(errors.includes('README.md must state that .mdoc is the main file format'))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
