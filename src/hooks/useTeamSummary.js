import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiConfig } from '../config/api'
import { parseTeamSummaryResponse } from '../lib/team-summary'
import { useLeagueContext } from './useLeagueContext'

async function requestTeamSummary(rosterId, regenerate, signal) {
  const response = await fetch(apiConfig.endpoints.teamSummary, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roster_id: rosterId, regenerate }),
    signal,
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(body.error || `Team summary request failed: ${response.status}`)
  }
  return parseTeamSummaryResponse(body)
}

export function useTeamSummary(rosterId) {
  const queryClient = useQueryClient()
  const { data: leagueContext } = useLeagueContext()
  const queryKey = [
    'team-summary',
    leagueContext?.season,
    leagueContext?.league_id,
    String(rosterId ?? ''),
  ]
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => requestTeamSummary(String(rosterId), false, signal),
    enabled: Boolean(rosterId && leagueContext),
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  })
  const regeneration = useMutation({
    mutationFn: () => requestTeamSummary(String(rosterId), true),
    onSuccess: (data) => queryClient.setQueryData(queryKey, data),
  })

  return {
    ...query,
    regenerate: regeneration.mutate,
    regenerateError: regeneration.error,
    isRegenerating: regeneration.isPending,
  }
}
