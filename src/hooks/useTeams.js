import { useQuery } from '@tanstack/react-query'
import { apiConfig } from '../config/api'
import { useLeagueContext } from './useLeagueContext'

/**
 * Custom hook to fetch and manage team names from the API using React Query
 * @returns {Object} { teams, loading, error }
 */
export const useTeams = () => {
  const { data: leagueContext } = useLeagueContext()
  const { data: teams = ['All Teams'], isLoading: loading, error } = useQuery({
    queryKey: ['teams', leagueContext?.season, leagueContext?.league_id],
    queryFn: async () => {
      // Try to fetch from overall standings first (more reliable than weekly)
      try {
        const params = new URLSearchParams({
          season: leagueContext.season,
          league_id: leagueContext.league_id
        })
        const response = await fetch(`${apiConfig.endpoints.overall}?${params}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(10000)
        })
        
        if (!response.ok) {
          throw new Error(`Overall standings request failed: ${response.status}`)
        }
        
        const data = await response.json()
        
        if (data.standings && data.standings.length > 0) {
          // Extract unique team names and sort alphabetically
          const teamNames = data.standings
            .filter(team => team.team_name && team.team_name.trim()) // Filter out any teams without names or empty names
            .map(team => team.team_name.trim())
            .filter((name, index, array) => array.indexOf(name) === index) // Remove duplicates
            .sort()
          
          if (teamNames.length > 0) {
            // Add "All Teams" option at the beginning
            return ['All Teams', ...teamNames]
          }
        }
        
        throw new Error('No valid team names found in overall standings')
      } catch (err) {
        console.error('Error fetching teams from overall standings:', err)
        // Fallback to a minimal set if nothing works
        console.log('Using fallback team list')
        return ['All Teams', 'Team 1', 'Team 2', 'Team 3', 'Team 4', 'Team 5', 
                'Team 6', 'Team 7', 'Team 8', 'Team 9', 'Team 10']
      }
    },
    enabled: !!leagueContext,
    staleTime: 1000 * 60 * 30, // 30 minutes - team data doesn't change often
    gcTime: 1000 * 60 * 60, // 1 hour
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      // Retry up to 2 times for network errors
      return failureCount < 2 && !error.message.includes('404')
    }
  })

  return { teams, loading, error }
}
