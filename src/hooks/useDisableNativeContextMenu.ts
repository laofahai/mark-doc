import { useEffect } from 'react'

export function useDisableNativeContextMenu() {
  useEffect(() => {
    const preventNativeContextMenu = (event: MouseEvent) => {
      event.preventDefault()
    }

    document.addEventListener('contextmenu', preventNativeContextMenu)
    return () => document.removeEventListener('contextmenu', preventNativeContextMenu)
  }, [])
}
