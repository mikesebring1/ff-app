import { useMemo } from 'react'
import { useCurrentWeek } from './useCurrentWeek'
import { usePlayerMap } from './usePlayerMap'
import {
  useSleeperProjections,
  useSleeperRosters,
  useSleeperUsers,
} from './useSleeper'
import { buildTeamRoster } from '../lib/team-roster'

export function useTeamRoster(rosterId) {
  const { displayWeek } = useCurrentWeek()
  const rostersQuery = useSleeperRosters()
  const usersQuery = useSleeperUsers()
  const playersQuery = usePlayerMap()
  const projectionsQuery = useSleeperProjections({ week: displayWeek })
  const data = useMemo(() => {
    if (!rostersQuery.data || !usersQuery.data || !playersQuery.data) return null

    return buildTeamRoster({
      rosterId,
      rosters: rostersQuery.data,
      users: usersQuery.data,
      players: playersQuery.data.players,
      projections: projectionsQuery.data?.projections,
    })
  }, [
    playersQuery.data,
    projectionsQuery.data,
    rosterId,
    rostersQuery.data,
    usersQuery.data,
  ])
  const queries = [rostersQuery, usersQuery, playersQuery]

  return {
    data,
    isLoading: !data && queries.some((query) => query.isPending),
    error: queries.find((query) => query.error)?.error ?? null,
  }
}
