import { useQuery } from '@tanstack/react-query'
import { apiConfig } from '../config/api'
import { parseWeeklyReviewResponse } from '../lib/weekly-review'
import { useLeagueContext } from './useLeagueContext'

async function requestWeeklyReview(week, signal) {
  const response = await fetch(apiConfig.endpoints.weeklyReview, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ week: Number(week) }),
    signal,
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(body.error || `Weekly review request failed: ${response.status}`)
  }
  return parseWeeklyReviewResponse(body)
}

export function useWeeklyReview(week, { enabled = true } = {}) {
  const { data: leagueContext } = useLeagueContext()
  return useQuery({
    queryKey: [
      'weekly-review',
      leagueContext?.season,
      leagueContext?.league_id,
      String(week ?? ''),
    ],
    queryFn: ({ signal }) => requestWeeklyReview(week, signal),
    enabled: Boolean(enabled && week && leagueContext),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  })
}
