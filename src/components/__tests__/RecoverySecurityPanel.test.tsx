import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RecoveryPanel } from '../RecoveryPanel'
import { PackageSecurityPanel } from '../PackageSecurityPanel'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('recovery and security panels', () => {
  it('renders and invokes recovery actions without localized literals in component assertions', () => {
    const onRetry = vi.fn()
    const onSaveAs = vi.fn()
    const onRestore = vi.fn()
    const onDiscard = vi.fn()
    render(<RecoveryPanel state={{
      documentId: 'doc-1',
      draftPath: '/tmp/recovery/doc-1/document.md',
      markdown: '# Recovery draft',
      originalUnchanged: true,
      reason: 'cloud-lock',
      priority: ['content-preserved', 'original-unchanged', 'user-visible'],
    }} onRetry={onRetry} onSaveAs={onSaveAs} onRestore={onRestore} onDiscard={onDiscard} />)

    expect(screen.getByText('recovery.retrySave')).toBeInTheDocument()
    expect(screen.getByText('recovery.restoreDraft')).toBeInTheDocument()
    fireEvent.click(screen.getByText('recovery.retrySave'))
    fireEvent.click(screen.getByText('recovery.saveAs'))
    fireEvent.click(screen.getByText('recovery.restoreDraft'))
    fireEvent.click(screen.getByText('recovery.discardDraft'))

    expect(onRetry).toHaveBeenCalledOnce()
    expect(onSaveAs).toHaveBeenCalledOnce()
    expect(onRestore).toHaveBeenCalledOnce()
    expect(onDiscard).toHaveBeenCalledOnce()
  })

  it('renders quarantined package resources and trust controls', () => {
    render(<PackageSecurityPanel
      quarantined={['presentation/print.css', 'presentation/reference.docx']}
      onTrustDocument={vi.fn()}
      onAllowResourceType={vi.fn()}
      onAllowDomain={vi.fn()}
      onAllowUrl={vi.fn()}
    />)

    expect(screen.getByText('package.quarantinedResources')).toBeInTheDocument()
    expect(screen.queryByText('package.corruptedRecovery')).not.toBeInTheDocument()
    expect(screen.getByText('presentation/print.css')).toBeInTheDocument()
    expect(screen.queryByText('security.enableRemoteForDocument')).not.toBeInTheDocument()
  })

  it('renders missing manifest resources without trust controls', () => {
    render(<PackageSecurityPanel
      quarantined={[]}
      missingManifestResources={['presentation/reference.docx']}
      onTrustDocument={vi.fn()}
      onAllowResourceType={vi.fn()}
      onAllowDomain={vi.fn()}
      onAllowUrl={vi.fn()}
    />)

    expect(screen.getByText('package.missingManifestResources')).toBeInTheDocument()
    expect(screen.getByText('presentation/reference.docx')).toBeInTheDocument()
    expect(screen.queryByText('security.enableRemoteForDocument')).not.toBeInTheDocument()
  })

  it('renders recovered, quarantined, and missing package states as separate sections', () => {
    render(<PackageSecurityPanel
      recovered
      quarantined={['https://cdn.example.com/theme.css']}
      missingManifestResources={['presentation/reference.docx']}
      onTrustDocument={vi.fn()}
      onAllowResourceType={vi.fn()}
      onAllowDomain={vi.fn()}
      onAllowUrl={vi.fn()}
    />)

    expect(screen.getByText('package.corruptedRecovery')).toBeInTheDocument()
    expect(screen.getByText('package.quarantinedResources')).toBeInTheDocument()
    expect(screen.getByText('package.missingManifestResources')).toBeInTheDocument()
    expect(screen.getByText('security.enableRemoteForDocument')).toBeInTheDocument()
  })

  it('shows recovery mode when a broken package was recovered', () => {
    render(<PackageSecurityPanel
      recovered
      quarantined={['presentation/print.css']}
      onTrustDocument={vi.fn()}
      onAllowResourceType={vi.fn()}
      onAllowDomain={vi.fn()}
      onAllowUrl={vi.fn()}
    />)

    expect(screen.getByText('package.corruptedRecovery')).toBeInTheDocument()
  })

  it('does not render when no package diagnostics are present', () => {
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
