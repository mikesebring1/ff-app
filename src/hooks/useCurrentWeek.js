import { useLeagueContext } from './useLeagueContext'
import { resolvePostseasonWeeks } from '../lib/postseason'

export function useCurrentWeek() {
  const query = useLeagueContext()
  const postseasonWeeks = resolvePostseasonWeeks(query.data?.settings)

  return {
    currentWeek: query.data?.week ?? null,
    displayWeek: query.data?.display_week ?? null,
    leagueStatus: query.data?.league_status ?? null,
    totalRosters: query.data?.total_rosters ?? null,
    playoffWeekStart: postseasonWeeks.startWeek,
    postseasonFinalWeek: postseasonWeeks.finalWeek,
    isLoading: query.isLoading,
    error: query.error
  }
}
