export interface SaveFailureInput {
  draftPath: string
  markdown: string
  originalUnchanged: boolean
  reason: 'disk-full' | 'permission' | 'cloud-lock' | 'version-conflict' | 'interrupted' | 'unknown'
}

export interface RecoveryState extends SaveFailureInput {
  documentId: string
  priority: ['content-preserved', 'original-unchanged', 'user-visible']
}

export class RecoveryService {
  private states = new Map<string, RecoveryState>()

  recordSaveFailure(documentId: string, input: SaveFailureInput): RecoveryState {
    const state: RecoveryState = {
      documentId,
      ...input,
      priority: ['content-preserved', 'original-unchanged', 'user-visible'],
    }
    this.states.set(documentId, state)
    return state
  }

  get(documentId: string) {
    return this.states.get(documentId)
  }

  clear(documentId: string) {
    this.states.delete(documentId)
  }
}
