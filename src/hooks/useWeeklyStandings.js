import { useQuery } from '@tanstack/react-query'
import { useSleeperProjections, useSleeperRosters, useSleeperUsers, useSleeperPlayers, useSleeperMatchups } from './useSleeper'
import { useActiveGameTime } from './useActiveGameTime'
import { useLeagueContext } from './useLeagueContext'

// Hook to return all weeks 1-17 (no API calls needed)
export function useAvailableWeeks() {
  return useQuery({
    queryKey: ['availableWeeks'],
    queryFn: async () => {
      // Always return weeks 1-17 (including playoffs)
      return Array.from({ length: 17 }, (_, i) => i + 1)
    },
    staleTime: Infinity, // Never refetch since this is static
    gcTime: Infinity, // Never garbage collect
  })
}

// Hook to get weekly standings for a specific week using Sleeper API
export function useWeeklyStandings(week, pollingInterval = null) {
  const { data: leagueContext } = useLeagueContext()
  // Check if it's an active game time
  const isActiveGameTime = useActiveGameTime()
  
  // Only use polling interval on active NFL game days
  const activePollingInterval = isActiveGameTime ? pollingInterval : null
  
  const { data: matchups } = useSleeperMatchups(week, { pollingInterval: activePollingInterval })
  const { data: rosters } = useSleeperRosters({ pollingInterval: activePollingInterval })
  const { data: users } = useSleeperUsers()
  const { data: players } = useSleeperPlayers()
  const { data: projectionsData } = useSleeperProjections({ week, pollingInterval: activePollingInterval })

  return useQuery({
    queryKey: ['weeklyStandings', leagueContext?.league_id, leagueContext?.season, week],
    queryFn: async () => {
      if (!week || !rosters || !users || !players) return []
      
      // Extract projections
      const projections = projectionsData?.projections || {}
      
      // Create user map for team names
      const userMap = {}
      users.forEach(user => {
        userMap[user.user_id] = user.metadata?.team_name || user.display_name || user.username
      })

      // Process rosters and build standings
      const standings = rosters.map(roster => {
        const teamName = userMap[roster.owner_id] || `Team ${roster.roster_id}`
        
        // Find matchup data for this roster to get actual points
        const matchup = matchups?.find(m => m.roster_id === roster.roster_id)

        // Build complete roster data with all players (starters and bench)
        const allPlayers = (roster.players || []).map(playerId => {
          const playerData = players.players[playerId]
          const projectedPoints = projections[playerId] || 0
          const actualPoints = matchup?.players_points?.[playerId] || 0
          const isStarter = roster.starters?.includes(playerId) || false

          return {
            player_id: playerId,
            player: `${playerData?.first_name || ''} ${playerData?.last_name || ''}`.trim() || playerData?.full_name || 'Unknown Player',
            position: playerData?.position || 'FLEX',
            team: playerData?.team || '',
            points: actualPoints,
            projected_points: projectedPoints,
            is_starter: isStarter
          }
        })

        // Separate starters and bench players
        const starters = allPlayers.filter(p => p.is_starter)
        const benchPlayers = allPlayers.filter(p => !p.is_starter)

        // Sort starters by their position in the starters array to maintain lineup order
        const startersInOrder = (roster.starters || []).map((playerId, index) => {
          const starter = starters.find(p => p.player_id === playerId)
          if (starter) {
            // Determine lineup position based on starter index (8 starters, no kickers)
            let lineupPosition = starter.position
            if (index === 0) lineupPosition = 'QB'
            else if (index === 1 || index === 2) lineupPosition = 'RB'
            else if (index === 3 || index === 4) lineupPosition = 'WR'
            else if (index === 5) lineupPosition = 'TE'
            else if (index === 6) lineupPosition = 'FLEX'
            else if (index === 7) lineupPosition = 'DST'

            return {
              ...starter,
              lineup_position: lineupPosition
            }
          }
          return null
        }).filter(Boolean)

        // Calculate projected total (always use projected points)
        const projectedTotal = startersInOrder.reduce((total, player) => {
          const projectedPoints = parseFloat(player.projected_points || 0)
          return total + projectedPoints
        }, 0)

        // Calculate total actual points for the team
        const totalActualPoints = matchup?.points || 0

        return {
          id: roster.roster_id.toString(),
          roster_id: roster.roster_id,
          teamName: teamName,
          points: totalActualPoints.toFixed(2),
          projectedTotal: projectedTotal.toFixed(1),
          starters: startersInOrder,
          benchPlayers: benchPlayers
        }
      })

      // Sort by points descending and add rankings + vs everyone records
      standings.sort((a, b) => parseFloat(b.points) - parseFloat(a.points))
      
      standings.forEach((team, index) => {
        team.rank = index + 1
        team.wins = standings.length - index - 1
        team.losses = index
        team.record = `${team.wins}-${team.losses}`
      })

      return standings
    },
    enabled: !!leagueContext && !!week && !!rosters && !!users && !!players && !!matchups,
    staleTime: activePollingInterval ? activePollingInterval : 1000 * 60 * 2, // Match polling interval when active, 2 minutes otherwise
    gcTime: 1000 * 60 * 10, // 10 minutes
    refetchInterval: activePollingInterval,
    retry: 3, // Retry up to 3 times on failure
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
  })

}
