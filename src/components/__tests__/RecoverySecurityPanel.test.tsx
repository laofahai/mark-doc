import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RecoveryPanel } from '../RecoveryPanel'
import { PackageSecurityPanel } from '../PackageSecurityPanel'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('recovery and security panels', () => {
  it('renders recovery actions without localized literals in component assertions', () => {
    render(<RecoveryPanel state={{
      documentId: 'doc-1',
      draftPath: '/tmp/recovery/doc-1/document.md',
      originalUnchanged: true,
      reason: 'cloud-lock',
      priority: ['content-preserved', 'original-unchanged', 'user-visible'],
    }} onRetry={vi.fn()} onSaveAs={vi.fn()} onRestore={vi.fn()} onDiscard={vi.fn()} />)

    expect(screen.getByText('recovery.retrySave')).toBeInTheDocument()
    expect(screen.getByText('recovery.restoreDraft')).toBeInTheDocument()
  })

  it('renders quarantined package resources and trust controls', () => {
    render(<PackageSecurityPanel
      quarantined={['presentation/print.css', 'presentation/reference.docx']}
      onTrustDocument={vi.fn()}
      onAllowImages={vi.fn()}
    />)

    expect(screen.getByText('presentation/print.css')).toBeInTheDocument()
    expect(screen.getByText('security.enableRemoteForDocument')).toBeInTheDocument()
  })
})
