import { useId, type ReactNode } from 'react'
import type { SidebarFileKind } from './sidebar-file-display'

interface SidebarDocumentIconProps {
  kind: SidebarFileKind
  ariaLabel: string
  className?: string
  size?: number
}

function iconId(prefix: string, id: string) {
  return `${prefix}-${id.replace(/:/g, '')}`
}

interface FileShellProps extends SidebarDocumentIconProps {
  children?: ReactNode
}

function FileShell({ children, ariaLabel, kind, className, size = 14 }: FileShellProps) {
  return (
    <svg
      aria-label={ariaLabel}
      className={className}
      data-kind={kind}
      data-sidebar-document-icon
      focusable="false"
      height={size}
      role="img"
      viewBox="0 0 16 16"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M3.25 1.75h6.05l3.45 3.45v9.05h-9.5z" fill="white" fillOpacity="0.72" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.15" />
      <path d="M9.15 1.9v3.45h3.45" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.05" />
      {children}
    </svg>
  )
}

function MarkDocFileIcon({ ariaLabel, className, kind, size }: SidebarDocumentIconProps) {
  const gradientId = iconId('markdoc-file-gradient', useId())
  return (
    <svg
      aria-label={ariaLabel}
      className={className}
      data-kind={kind}
      data-sidebar-document-icon
      focusable="false"
      height={size}
      role="img"
      viewBox="0 0 16 16"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gradientId} x1="2.5" x2="13.5" y1="1.5" y2="14.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3B82F6" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <path d="M3 1.75h6.2L13 5.55v8.7H3z" fill={`url(#${gradientId})`} />
      <path d="M9.2 1.75v3.8H13" fill="white" opacity="0.26" />
      <path d="M4.7 11.8V4.45l2.45 3.5 2.4-3.5c1.6-2 3.2.2 2.95 2.95-.18 2.1-1.4 3.2-3.3 3.05" fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.15" />
    </svg>
  )
}

function WordFileIcon(props: SidebarDocumentIconProps) {
  return (
    <FileShell {...props}>
      <path d="M5.15 6.25h5.6M5.15 8.25h5.25M5.15 10.25h3.65" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.15" />
      <path d="M4.45 12.15h7.1" stroke="currentColor" strokeLinecap="round" strokeOpacity="0.22" strokeWidth="1.15" />
    </FileShell>
  )
}

function MarkdownFileIcon(props: SidebarDocumentIconProps) {
  return (
    <FileShell {...props}>
      <path d="M4.7 10.7V6.25l1.55 2.2 1.55-2.2v4.45M9.2 6.25v4.45M8.35 9.9l.85.85.85-.85" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.05" />
    </FileShell>
  )
}

function TextFileIcon(props: SidebarDocumentIconProps) {
  return (
    <FileShell {...props}>
      <path d="M5 6.25h5.8M5 8.35h5.8M5 10.45h3.9" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.05" />
    </FileShell>
  )
}

export function SidebarDocumentIcon(props: SidebarDocumentIconProps) {
  switch (props.kind) {
    case 'markdoc':
      return <MarkDocFileIcon {...props} />
    case 'word':
      return <WordFileIcon {...props} />
    case 'markdown':
      return <MarkdownFileIcon {...props} />
    case 'text':
    case 'unknown':
      return <TextFileIcon {...props} />
  }
}
