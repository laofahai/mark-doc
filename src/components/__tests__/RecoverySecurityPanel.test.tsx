import { fireEvent, render, screen } from '@testing-library/react'
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
      onAllowResourceType={vi.fn()}
      onAllowDomain={vi.fn()}
      onAllowUrl={vi.fn()}
    />)

    expect(screen.getByText('presentation/print.css')).toBeInTheDocument()
    expect(screen.queryByText('security.enableRemoteForDocument')).not.toBeInTheDocument()
  })

  it('does not render when no package resources are quarantined', () => {
    const { container } = render(<PackageSecurityPanel
      quarantined={[]}
      onTrustDocument={vi.fn()}
      onAllowResourceType={vi.fn()}
      onAllowDomain={vi.fn()}
      onAllowUrl={vi.fn()}
    />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders and invokes scoped trust controls for quarantined remote resources', () => {
    const onTrustDocument = vi.fn()
    const onAllowResourceType = vi.fn()
    const onAllowDomain = vi.fn()
    const onAllowUrl = vi.fn()
    const remoteUrl = 'https://images.example.com/diagram.png'

    render(<PackageSecurityPanel
      quarantined={[remoteUrl]}
      onTrustDocument={onTrustDocument}
      onAllowResourceType={onAllowResourceType}
      onAllowDomain={onAllowDomain}
      onAllowUrl={onAllowUrl}
    />)

    fireEvent.click(screen.getByText('security.enableRemoteForDocument'))
    fireEvent.click(screen.getByText('security.enableRemoteImages'))
    fireEvent.click(screen.getByText('security.allowRemoteDomain'))
    fireEvent.click(screen.getByText('security.allowRemoteUrl'))

    expect(onTrustDocument).toHaveBeenCalledOnce()
    expect(onAllowResourceType).toHaveBeenCalledWith('image')
    expect(onAllowDomain).toHaveBeenCalledWith('images.example.com')
    expect(onAllowUrl).toHaveBeenCalledWith(remoteUrl)
  })
})
