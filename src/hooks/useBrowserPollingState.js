import { useSyncExternalStore } from 'react'

function browserPollingSnapshot() {
  const isVisible = typeof document === 'undefined' || document.visibilityState === 'visible'
  const isOnline = typeof navigator === 'undefined' || navigator.onLine
  const isFocused = typeof document === 'undefined'
    || typeof document.hasFocus !== 'function'
    || document.hasFocus()
  return (isVisible ? 1 : 0) | (isOnline ? 2 : 0) | (isFocused ? 4 : 0)
}

function subscribeToBrowserPollingState(onChange) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {}
  }

  document.addEventListener('visibilitychange', onChange)
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  window.addEventListener('focus', onChange)
  window.addEventListener('blur', onChange)

  return () => {
    document.removeEventListener('visibilitychange', onChange)
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
    window.removeEventListener('focus', onChange)
    window.removeEventListener('blur', onChange)
  }
}

export function useBrowserPollingState() {
  const snapshot = useSyncExternalStore(
    subscribeToBrowserPollingState,
    browserPollingSnapshot,
    () => 7,
  )

  return {
    visibilityState: snapshot & 1 ? 'visible' : 'hidden',
    isOnline: Boolean(snapshot & 2),
    isFocused: Boolean(snapshot & 4),
  }
}
