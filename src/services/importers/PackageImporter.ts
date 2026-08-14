import { invoke } from '@tauri-apps/api/core'
import { err, ok, type Result } from '../document/errors'

export interface PackageManifest {
  format: 'markdoc-package'
  version: number
  entry: string
}

interface PackageInspectResult {
  manifest: PackageManifest
  entries: string[]
  quarantined: string[]
}

export class PackageImporter {
  async inspect(path: string): Promise<Result<PackageInspectResult>> {
    try {
      const result = await invoke<PackageInspectResult>('read_mdoc_package', { packagePath: path })
      if (result.manifest.format !== 'markdoc-package') {
        return err('package.invalidManifest', { messageKey: 'errors.package.invalidManifest', params: { path } })
      }
      return ok(result)
    } catch (cause) {
      return err('package.openFailed', { messageKey: 'errors.package.invalidManifest', params: { path }, cause })
    }
  }
}
