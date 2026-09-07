import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export function validateReleaseAssets(manifest, release, tag, repository) {
  const errors = []
  if (!release?.isDraft) errors.push('Release must remain a draft until native acceptance is complete')
  if (release?.tagName !== tag) errors.push('Release tag does not match the candidate')
  if (manifest?.version !== tag.replace(/^v/, '')) errors.push('Updater version does not match the candidate')
  const assets = new Map((release?.assets ?? []).map((asset) => [asset.name, asset.size]))
  const prefix = `https://github.com/${repository}/releases/download/${tag}/`
  for (const target of ['darwin-aarch64', 'darwin-x86_64', 'linux-x86_64', 'windows-x86_64']) {
    const entry = manifest?.platforms?.[target]
    if (!entry || typeof entry.signature !== 'string' || !entry.signature.trim()) {
      errors.push(`${target}: missing updater entry or signature`)
      continue
    }
    if (typeof entry.url !== 'string' || !entry.url.startsWith(prefix)) {
      errors.push(`${target}: updater URL must refer to this repository and tag`)
      continue
    }
    let name
    try {
      name = decodeURIComponent(entry.url.slice(prefix.length))
    } catch {
      errors.push(`${target}: malformed asset URL`)
      continue
    }
    if (!(assets.get(name) > 0)) errors.push(`${target}: missing or empty updater binary`)
    if (!(assets.get(`${name}.sig`) > 0)) errors.push(`${target}: missing or empty signature file`)
  }
  return errors
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [manifestPath, releasePath, tag, repository] = process.argv.slice(2)
  try {
    if (!manifestPath || !releasePath || !tag || !repository) throw new Error('Expected manifest, release metadata, tag and repository')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const release = JSON.parse(await readFile(releasePath, 'utf8'))
    const errors = validateReleaseAssets(manifest, release, tag, repository)
    if (errors.length) throw new Error(errors.join('\n'))
    console.log('Draft updater assets are complete; native installation and signature verification are still required')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
