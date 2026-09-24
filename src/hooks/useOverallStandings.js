import { useQuery } from '@tanstack/react-query'
import { apiConfig } from '../config/api'
import { useLeagueContext } from './useLeagueContext'
import {
  getPostseasonStandingsRefreshInterval,
  resolvePostseasonWeeks,
} from '../lib/postseason'

export function useOverallStandings({ monitorPostseason = false } = {}) {
  const { data: leagueContext } = useLeagueContext()
  const { startWeek: playoffWeekStart } = resolvePostseasonWeeks(
    leagueContext?.settings,
  )
  const monitorIncompleteStandings = monitorPostseason
    && Number(leagueContext?.display_week) >= playoffWeekStart

  return useQuery({
    queryKey: ['overallStandings', leagueContext?.season, leagueContext?.league_id],
    queryFn: async () => {
      const params = new URLSearchParams({
        season: leagueContext.season,
        league_id: leagueContext.league_id
      })
      const response = await fetch(`${apiConfig.endpoints.overall}?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      if (!response.ok) {
        throw new Error(`Overall standings request failed: ${response.status}`)
      }
      
      const data = await response.json()
      
      // Check if response has standings data
      if (!data.standings || !Array.isArray(data.standings)) {
        throw new Error('No overall standings data available')
      }
      
      // Transform API data to match expected format
      return data.standings.map((team) => {
        const wins = Number(team.total_wins ?? 0)
        const losses = Number(team.total_losses ?? 0)

        return {
          id: team.team_id,
          rank: team.current_rank,
          teamName: team.team_name,
          wins,
          losses,
          overallRecord: `${wins}-${losses}`,
          earnings: team.earnings ? `$${team.earnings}` : '$0',
          totalPoints: parseFloat(team.total_points || 0).toFixed(2),
          playoffPct: team.playoff_percentage ? `${team.playoff_percentage}%` : '0.0%',
        }
      })
    },
    enabled: !!leagueContext,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
    refetchOnMount: monitorIncompleteStandings ? 'always' : true,
    refetchInterval: (query) => (
      getPostseasonStandingsRefreshInterval({
        monitor: monitorIncompleteStandings,
        standings: query.state.data,
        playoffWeekStart,
        totalRosters: leagueContext?.total_rosters,
      })
    ),
  })
}
