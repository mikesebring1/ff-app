import { useQuery } from '@tanstack/react-query'

// Sleeper API base URL
const SLEEPER_API_BASE = 'https://api.sleeper.app/v1'

// Your league ID from the Lambda function
const LEAGUE_ID = '1251986365806034944'

const fetchSleeperJson = async (path, timeout = 10000) => {
  const response = await fetch(`${SLEEPER_API_BASE}${path}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(timeout)
  })

  if (!response.ok) {
    throw new Error(`Sleeper API error: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

/**
 * Hook to fetch rosters directly from Sleeper API
 * @returns {Object} TanStack Query result with roster data
 */
export const useSleeperRosters = (options = {}) => {
  const { pollingInterval = null } = options
  
  return useQuery({
    queryKey: ['sleeper-rosters', LEAGUE_ID],
    queryFn: () => fetchSleeperJson(`/league/${LEAGUE_ID}/rosters`),
    staleTime: 5 * 60 * 1000, // 5 minutes for roster data
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchInterval: pollingInterval
  })
}

/**
 * Hook to fetch users directly from Sleeper API
 * @returns {Object} TanStack Query result with user data
 */
export const useSleeperUsers = () => {
  return useQuery({
    queryKey: ['sleeper-users', LEAGUE_ID],
    queryFn: () => fetchSleeperJson(`/league/${LEAGUE_ID}/users`),
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false
  })
}


/**
 * Hook to fetch matchups for a specific week directly from Sleeper API
 * @param {number} week - Week number to fetch matchups for
 * @param {Object} options - Query options including polling interval
 * @returns {Object} TanStack Query result with matchup data
 */
export const useSleeperMatchups = (week, options = {}) => {
  const { pollingInterval = null } = options
  
  return useQuery({
    queryKey: ['sleeper-matchups', LEAGUE_ID, week],
    queryFn: async () => {
      if (!week) {
        throw new Error('Week is required to fetch matchups')
      }

      return fetchSleeperJson(`/league/${LEAGUE_ID}/matchups/${week}`)
    },
    enabled: !!week,
    staleTime: 5 * 60 * 1000, // 5 minutes for matchup data
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchInterval: pollingInterval
  })
}

/**
 * Hook to fetch projections directly from Sleeper API
 * @param {number} week - Week number to fetch projections for
 * @param {string} season - Season year (defaults to '2025')
 * @param {string} seasonType - Season type (defaults to 'regular')
 * @returns {Object} TanStack Query result with projection data
 */
export const useSleeperProjections = ({
  week, season = '2025', seasonType = 'regular', pollingInterval = null } = {}) => {
  return useQuery({
    enabled: !!week,
    queryKey: ['sleeper-projections', week, season, seasonType],
    queryFn: async () => {
      if (!week) {
        throw new Error('Week is required to fetch projections')
      }

      const projections = await fetchSleeperJson(
        `/projections/nfl/${seasonType}/${season}/${week}`,
        15000
      )

      // filter only objects with pts_ppr
      const filteredProjections = Object.entries(projections).reduce((acc, [playerId, data]) => {
        if (data.pts_ppr !== undefined) {
          acc[playerId] = data.pts_ppr
        }
        return acc
      }, {})
      
      
      return {
        season,
        week: parseInt(week),
        seasonType,
        projections: filteredProjections
      }
    },
    retry: 3,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchInterval: pollingInterval
  })
}

/**
 * Hook to fetch current NFL state directly from Sleeper API
 * @returns {Object} TanStack Query result with NFL state data
 */
export const useSleeperNFLState = () => {
  return useQuery({
    queryKey: ['sleeper-nfl-state'],
    queryFn: () => fetchSleeperJson('/state/nfl'),
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  })
}

/**
 * Hook to fetch all NFL players directly from Sleeper API
 * Note: This is a large dataset, use sparingly
 * @returns {Object} TanStack Query result with all NFL players
 */
export const useSleeperPlayers = () => {
  return useQuery({
    queryKey: ['sleeper-players'],
    queryFn: async () => {
      const players = await fetchSleeperJson('/players/nfl', 30000)
      
      // Convert to array and add some stats
      const playerArray = Object.entries(players).map(([id, data]) => ({
        player_id: id,
        ...data
      }))

      return {
        totalPlayers: playerArray.length,
        activePlayers: playerArray.filter(p => p.team).length,
        players: players // Original object format
      }
    },
    staleTime: 24 * 60 * 60 * 1000, // 24 hours for player data
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false
  })
}
