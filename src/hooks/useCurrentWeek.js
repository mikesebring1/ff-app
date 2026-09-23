import { useLeagueContext } from './useLeagueContext'

export function useCurrentWeek() {
  const query = useLeagueContext()

  return {
    currentWeek: query.data?.week ?? null,
    displayWeek: query.data?.display_week ?? null,
    isLoading: query.isLoading,
    error: query.error
  }
}
