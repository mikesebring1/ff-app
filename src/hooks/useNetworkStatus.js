import { useState, useEffect } from 'react'

export const useNetworkStatus = () => {
  const [isOnline, setIsOnline] = useState(() => {
    if (typeof window !== 'undefined' && 'navigator' in window) {
      return navigator.onLine
    }
    return true
  })

  const [connectionType, setConnectionType] = useState('unknown')

  useEffect(() => {
    if (typeof window === 'undefined' || !('navigator' in window)) {
      return
    }

    const updateConnectionInfo = () => {
      if ('connection' in navigator) {
        const connection = navigator.connection
        setConnectionType(connection.effectiveType || connection.type || 'unknown')
      }
    }

    const handleOnline = () => {
      setIsOnline(true)
      updateConnectionInfo()
    }

    const handleOffline = () => {
      setIsOnline(false)
      setConnectionType('offline')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    if ('connection' in navigator) {
      navigator.connection.addEventListener('change', updateConnectionInfo)
      updateConnectionInfo()
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if ('connection' in navigator) {
        navigator.connection.removeEventListener('change', updateConnectionInfo)
      }
    }
  }, [])

  return { 
    isOnline, 
    isSlowConnection: connectionType === 'slow-2g' || connectionType === '2g'
  }
}
