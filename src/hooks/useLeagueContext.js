import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiConfig } from '../config/api'
import { parseLeagueContext } from '../lib/league-context'
import {
  isLeagueContextRefreshEligible,
  leagueContextRefreshCoordinator,
} from '../lib/league-context-refresh'
import { useBrowserPollingState } from './useBrowserPollingState'

const LEAGUE_CONTEXT_QUERY_KEY = ['league-context']

export function useLeagueContext() {
  const queryClient = useQueryClient()
  const subscriptionRef = useRef(null)
  const { visibilityState, isOnline, isFocused } = useBrowserPollingState()
  const refreshEnabled = isLeagueContextRefreshEligible({
    visibilityState,
    isOnline,
    isFocused,
  })
  const refreshEnabledRef = useRef(refreshEnabled)
  refreshEnabledRef.current = refreshEnabled

  const query = useQuery({
    queryKey: LEAGUE_CONTEXT_QUERY_KEY,
    queryFn: async () => {
      const response = await fetch(apiConfig.endpoints.leagueContext, {
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10_000)
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.details || body.error || `League context request failed: ${response.status}`)
      }

      return parseLeagueContext(await response.json())
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 2
  })

  useEffect(() => {
    subscriptionRef.current = leagueContextRefreshCoordinator.subscribe(
      LEAGUE_CONTEXT_QUERY_KEY,
      {
        enabled: refreshEnabledRef.current,
        refetch: () => queryClient.refetchQueries({
          queryKey: LEAGUE_CONTEXT_QUERY_KEY,
          exact: true,
          type: 'active',
        }, { cancelRefetch: false }),
      },
    )

    return () => {
      subscriptionRef.current?.unsubscribe()
      subscriptionRef.current = null
    }
  }, [queryClient])

  useEffect(() => {
    subscriptionRef.current?.update(refreshEnabled)
  }, [refreshEnabled])

  return query
}
