import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLeagueContext } from './useLeagueContext'
import {
  MATCHUP_POLL_INTERVAL_MS,
  isMatchupPollingEligible,
  isMatchupQueryEligible,
  isProjectionQueryEligible,
  matchupPollingCoordinator,
  normalizeWeek,
  sleeperMatchupQueryKey,
} from '../lib/matchup-polling'
import { recordSleeperRequest } from '../lib/sleeper-request-counter'
import { useBrowserPollingState } from './useBrowserPollingState'

const SLEEPER_API_BASE = 'https://api.sleeper.app/v1'

async function fetchSleeperJson(path, {
  timeout = 10_000,
  signal,
  resource,
  queryKey,
} = {}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)
  const abortRequest = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', abortRequest, { once: true })

  recordSleeperRequest({ resource, queryKey, path })

  try {
    const response = await fetch(`${SLEEPER_API_BASE}${path}`, {
      method: 'GET',
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Sleeper API error: ${response.status} ${response.statusText}`)
    }

    return response.json()
  } finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener('abort', abortRequest)
  }
}

export const useSleeperRosters = () => {
  const { data: leagueContext } = useLeagueContext()
  const leagueId = leagueContext?.league_id

  return useQuery({
    queryKey: ['sleeper-rosters', leagueId],
    queryFn: ({ signal }) => fetchSleeperJson(`/league/${leagueId}/rosters`, {
      signal,
      resource: 'rosters',
      queryKey: String(leagueId),
    }),
    enabled: Boolean(leagueId),
    staleTime: 4 * 60 * 60 * 1000,
    gcTime: 4 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export const useSleeperUsers = () => {
  const { data: leagueContext } = useLeagueContext()
  const leagueId = leagueContext?.league_id

  return useQuery({
    queryKey: ['sleeper-users', leagueId],
    queryFn: ({ signal }) => fetchSleeperJson(`/league/${leagueId}/users`, {
      signal,
      resource: 'users',
      queryKey: String(leagueId),
    }),
    enabled: Boolean(leagueId),
    staleTime: 4 * 60 * 60 * 1000,
    gcTime: 4 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export const useSleeperMatchups = (week, { enabled = true } = {}) => {
  const { data: leagueContext } = useLeagueContext()
  const queryClient = useQueryClient()
  const subscriptionRef = useRef(null)
  const { visibilityState, isOnline } = useBrowserPollingState()
  const leagueId = leagueContext?.league_id
  const selectedWeek = normalizeWeek(week)
  const activeWeek = normalizeWeek(leagueContext?.week)
  const queryKey = sleeperMatchupQueryKey(leagueId, selectedWeek)
  const pollingEnabled = isMatchupPollingEligible({
    enabled: enabled && Boolean(leagueId),
    selectedWeek,
    currentWeek: activeWeek,
    visibilityState,
    isOnline,
  })
  const pollingEnabledRef = useRef(pollingEnabled)
  pollingEnabledRef.current = pollingEnabled

  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => fetchSleeperJson(
      `/league/${leagueId}/matchups/${selectedWeek}`,
      {
        signal,
        resource: 'matchups',
        queryKey: `${leagueId}:${selectedWeek}`,
      },
    ),
    enabled: isMatchupQueryEligible({
      enabled,
      leagueId,
      selectedWeek,
      isOnline,
    }),
    staleTime: selectedWeek === activeWeek
      ? MATCHUP_POLL_INTERVAL_MS
      : 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  useEffect(() => {
    if (!leagueId || !selectedWeek) return undefined

    const key = sleeperMatchupQueryKey(leagueId, selectedWeek)
    subscriptionRef.current = matchupPollingCoordinator.subscribe(key, {
      enabled: pollingEnabledRef.current,
      refetch: () => queryClient.refetchQueries({
        queryKey: key,
        exact: true,
        type: 'active',
      }, { cancelRefetch: false }),
    })

    return () => {
      subscriptionRef.current?.unsubscribe()
      subscriptionRef.current = null
    }
  }, [leagueId, queryClient, selectedWeek])

  useEffect(() => {
    subscriptionRef.current?.update(pollingEnabled)
  }, [pollingEnabled])

  return {
    ...query,
    isLivePolling: pollingEnabled,
    matchupIdentity: leagueId && selectedWeek
      ? `${leagueId}:${selectedWeek}`
      : null,
  }
}

export const useSleeperProjections = ({ week, enabled = true } = {}) => {
  const { data: leagueContext } = useLeagueContext()
  const season = leagueContext?.season
  const seasonType = leagueContext?.season_type
  const selectedWeek = normalizeWeek(week)

  return useQuery({
    enabled: isProjectionQueryEligible({
      enabled,
      season,
      seasonType,
      selectedWeek,
    }),
    queryKey: ['sleeper-projections', season, seasonType, selectedWeek],
    queryFn: async ({ signal }) => {
      const projections = await fetchSleeperJson(
        `/projections/nfl/${seasonType}/${season}/${selectedWeek}`,
        {
          timeout: 15_000,
          signal,
          resource: 'projections',
          queryKey: `${season}:${seasonType}:${selectedWeek}`,
        },
      )
      const filteredProjections = Object.entries(projections).reduce(
        (filtered, [playerId, data]) => {
          if (data.pts_ppr !== undefined) {
            filtered[playerId] = data.pts_ppr
          }
          return filtered
        },
        {},
      )

      return {
        season,
        week: selectedWeek,
        seasonType,
        projections: filteredProjections,
      }
    },
    retry: 3,
    staleTime: 15 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}
