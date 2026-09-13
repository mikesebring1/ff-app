import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  useSleeperMatchups,
  useSleeperPlayers,
  useSleeperProjections,
  useSleeperRosters,
  useSleeperUsers,
} from './useSleeper'
import { buildWeeklyStandings } from '../lib/vs-everyone'

export function useAvailableWeeks() {
  return useQuery({
    queryKey: ['availableWeeks'],
    queryFn: async () => Array.from({ length: 17 }, (_, index) => index + 1),
    staleTime: Infinity,
    gcTime: Infinity,
  })
}

export function useWeeklyStandings(week) {
  const matchupsQuery = useSleeperMatchups(week)
  const rostersQuery = useSleeperRosters()
  const usersQuery = useSleeperUsers()
  const playersQuery = useSleeperPlayers()
  const projectionsQuery = useSleeperProjections({ week })

  const isReady = Boolean(
    week &&
    matchupsQuery.data &&
    rostersQuery.data &&
    usersQuery.data &&
    playersQuery.data,
  )
  const standings = useMemo(() => {
    if (!isReady) return []

    return buildWeeklyStandings({
      matchups: matchupsQuery.data,
      rosters: rostersQuery.data,
      users: usersQuery.data,
      players: playersQuery.data.players,
      projections: projectionsQuery.data?.projections ?? {},
    })
  }, [
    isReady,
    matchupsQuery.data,
    playersQuery.data,
    projectionsQuery.data,
    rostersQuery.data,
    usersQuery.data,
  ])

  const queries = [
    matchupsQuery,
    rostersQuery,
    usersQuery,
    playersQuery,
    projectionsQuery,
  ]
  const requiredQueries = [
    matchupsQuery,
    rostersQuery,
    usersQuery,
    playersQuery,
  ]

  return {
    data: standings,
    isLoading: !isReady && queries.some((query) => query.isPending),
    isFetching: queries.some((query) => query.isFetching),
    error: requiredQueries.find((query) => query.error)?.error ?? null,
    dataUpdatedAt: matchupsQuery.dataUpdatedAt,
    isLivePolling: matchupsQuery.isLivePolling,
    matchupIdentity: matchupsQuery.matchupIdentity,
    matchupSnapshot: matchupsQuery.data,
  }
}
