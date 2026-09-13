import { useMemo } from 'react'
import { useSleeperRosters, useSleeperUsers } from './useSleeper'
import { buildTeamOptions } from '../lib/team-names'

/**
 * Build current team names from the shared Sleeper roster and user queries.
 * @returns {Object} { teams, loading, error }
 */
export const useTeams = () => {
  const rostersQuery = useSleeperRosters()
  const usersQuery = useSleeperUsers()
  const teams = useMemo(
    () => buildTeamOptions(rostersQuery.data, usersQuery.data),
    [rostersQuery.data, usersQuery.data],
  )

  return {
    teams,
    loading: rostersQuery.isPending || usersQuery.isPending,
    error: rostersQuery.error || usersQuery.error || null,
  }
}
