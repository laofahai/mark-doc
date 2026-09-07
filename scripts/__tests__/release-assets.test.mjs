import assert from 'node:assert/strict'
import { it } from 'node:test'
import { validateReleaseAssets } from '../validate-release-assets.mjs'

function fixture() {
  const targets = ['darwin-aarch64', 'darwin-x86_64', 'linux-x86_64', 'windows-x86_64']
  const platforms = Object.fromEntries(targets.map((target) => [target, {
    signature: 'test-signature',
    url: `https://github.com/laofahai/mark-doc/releases/download/v0.1.2/${target}.zip`,
  }]))
  return {
    manifest: { version: '0.1.2', platforms },
    release: { isDraft: true, tagName: 'v0.1.2', assets: targets.flatMap((target) => [
      { name: `${target}.zip`, size: 100 }, { name: `${target}.zip.sig`, size: 20 },
    ]) },
  }
}

it('accepts complete draft updater assets', () => {
  const { manifest, release } = fixture()
  assert.deepEqual(validateReleaseAssets(manifest, release, 'v0.1.2', 'laofahai/mark-doc'), [])
})

for (const [name, mutate] of [
  ['published release', ({ release }) => { release.isDraft = false }],
  ['wrong version', ({ manifest }) => { manifest.version = '0.1.1' }],
  ['wrong tag', ({ release }) => { release.tagName = 'v0.1.1' }],
  ['missing platform', ({ manifest }) => { delete manifest.platforms['darwin-aarch64'] }],
  ['missing signature', ({ manifest }) => { manifest.platforms['darwin-aarch64'].signature = '' }],
  ['foreign URL', ({ manifest }) => { manifest.platforms['darwin-aarch64'].url = 'https://example.com/app.zip' }],
  ['missing binary', ({ release }) => { release.assets.shift() }],
  ['empty binary', ({ release }) => { release.assets[0].size = 0 }],
  ['missing signature file', ({ release }) => { release.assets.splice(1, 1) }],
]) {
  it(`rejects ${name}`, () => {
    const data = fixture()
    mutate(data)
    assert.ok(validateReleaseAssets(data.manifest, data.release, 'v0.1.2', 'laofahai/mark-doc').length > 0)
  })
}
