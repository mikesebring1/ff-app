import { useQuery } from '@tanstack/react-query'
import { apiConfig } from '../config/api'
import { useLeagueContext } from './useLeagueContext'

export function useOverallStandings() {
  const { data: leagueContext } = useLeagueContext()

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
      return data.standings.map(team => ({
        id: team.team_id,
        rank: team.current_rank,
        teamName: team.team_name,
        overallRecord: `${team.total_wins || 0}-${team.total_losses || 0}`,
        earnings: team.earnings ? `$${team.earnings}` : '$0',
        totalPoints: parseFloat(team.total_points || 0).toFixed(2),
        playoffPct: team.playoff_percentage ? `${team.playoff_percentage}%` : '0.0%',
      }))
    },
    enabled: !!leagueContext,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
  })
}
