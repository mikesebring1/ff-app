import { useQuery } from '@tanstack/react-query'
import { apiConfig } from '../config/api'
import { parseLeagueContext } from '../lib/league-context'

export function useLeagueContext() {
  return useQuery({
    queryKey: ['league-context'],
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
    refetchOnWindowFocus: true,
    retry: 2
  })
}
