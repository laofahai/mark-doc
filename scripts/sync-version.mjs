import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

export function normalizeVersion(input) {
  const raw = String(input ?? '').trim()
  const version = raw.startsWith('v') ? raw.slice(1) : raw

  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`Invalid version "${raw}". Expected SemVer like 0.1.2 or v0.1.2.`)
  }

  return version
}

function updatePackageVersionToml(source, version) {
  const lines = source.split('\n')
  let inPackage = false
  let updated = false

  const next = lines.map((line) => {
    const section = line.match(/^\s*\[([^\]]+)\]\s*$/)
    if (section) {
      inPackage = section[1] === 'package'
    }

    if (inPackage && /^\s*version\s*=/.test(line)) {
      updated = true
      return line.replace(/=\s*"[^"]*"/, `= "${version}"`)
    }

    return line
  })

  if (!updated) {
    throw new Error('Could not find [package] version in src-tauri/Cargo.toml')
  }

  return next.join('\n')
}

export async function syncVersionInDirectory(root, input) {
  const version = normalizeVersion(input)

  const packagePath = join(root, 'package.json')
  const tauriPath = join(root, 'src-tauri/tauri.conf.json')
  const cargoPath = join(root, 'src-tauri/Cargo.toml')

  const pkg = JSON.parse(await readFile(packagePath, 'utf8'))
  pkg.version = version
  await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`)

  const tauri = JSON.parse(await readFile(tauriPath, 'utf8'))
  tauri.version = version
  await writeFile(tauriPath, `${JSON.stringify(tauri, null, 2)}\n`)

  const cargo = await readFile(cargoPath, 'utf8')
  await writeFile(cargoPath, updatePackageVersionToml(cargo, version))

  return version
}

async function main() {
  const input = process.argv[2] || process.env.GITHUB_REF_NAME
  if (!input) {
    throw new Error('Missing version. Pass v0.1.2 or set GITHUB_REF_NAME.')
  }

  const version = await syncVersionInDirectory(process.cwd(), input)
  console.log(`Synced MarkDoc version to ${version}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
