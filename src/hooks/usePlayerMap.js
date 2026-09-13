import { useQuery } from '@tanstack/react-query'
import { apiConfig } from '../config/api'
import { parsePlayerMap } from '../lib/player-map'
import { useLeagueContext } from './useLeagueContext'

const ONE_DAY_MS = 24 * 60 * 60 * 1000

async function fetchPlayerMap(url, signal) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10_000)
  const abortRequest = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', abortRequest, { once: true })

  try {
    return await fetch(url, {
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener('abort', abortRequest)
  }
}

export function usePlayerMap() {
  const { data: leagueContext } = useLeagueContext()
  const season = leagueContext?.season
  const leagueId = leagueContext?.league_id

  return useQuery({
    queryKey: ['player-map', season, leagueId],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ season, league_id: leagueId })
      const response = await fetchPlayerMap(
        `${apiConfig.endpoints.players}?${params}`,
        signal,
      )

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || `Player metadata request failed: ${response.status}`)
      }

      return parsePlayerMap(await response.json(), { season, leagueId })
    },
    enabled: Boolean(season && leagueId),
    staleTime: ONE_DAY_MS,
    gcTime: ONE_DAY_MS,
    refetchOnWindowFocus: false,
    retry: 2,
  })
}
