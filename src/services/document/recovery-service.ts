import { mkdir, readTextFile, remove, writeTextFile } from '@tauri-apps/plugin-fs'

export interface SaveFailureInput {
  markdown: string
  originalUnchanged: boolean
  reason: 'disk-full' | 'permission' | 'cloud-lock' | 'version-conflict' | 'interrupted' | 'unknown'
}

export interface RecoveryState extends Omit<SaveFailureInput, 'markdown'> {
  documentId: string
  draftPath: string
  priority: ['content-preserved', 'original-unchanged', 'user-visible']
}

export class RecoveryService {
  private states = new Map<string, RecoveryState>()
  private readonly recoveryRoot = '/tmp/markdoc/recovery'

  async persistSaveFailure(documentId: string, input: SaveFailureInput): Promise<RecoveryState> {
    const safeId = documentId.replace(/[^a-zA-Z0-9._-]/g, '_')
    const draftPath = `${this.recoveryRoot}/${safeId}.md`
    await mkdir(this.recoveryRoot, { recursive: true })
    await writeTextFile(draftPath, input.markdown)
    const state: RecoveryState = {
      documentId,
      draftPath,
      originalUnchanged: input.originalUnchanged,
      reason: input.reason,
      priority: ['content-preserved', 'original-unchanged', 'user-visible'],
    }
    this.states.set(documentId, state)
    return state
  }

  get(documentId: string) {
    return this.states.get(documentId)
  }

  async restoreDraft(documentId: string) {
    const state = this.states.get(documentId)
    return state ? readTextFile(state.draftPath) : null
  }

  async clear(documentId: string) {
    const draftPath = this.states.get(documentId)?.draftPath
    this.states.delete(documentId)
    if (draftPath) {
      try {
        await remove(draftPath)
      } catch {
        // The in-memory recovery state is still cleared if the draft was already removed.
      }
    }
  }
}
