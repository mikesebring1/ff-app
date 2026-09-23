import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  useSleeperMatchups,
  useSleeperProjections,
  useSleeperRosters,
  useSleeperUsers,
} from './useSleeper'
import { usePlayerMap } from './usePlayerMap'
import { buildWeeklyStandings } from '../lib/vs-everyone'
import { buildPregameTeams, hasWeekStarted } from '../lib/weekly-view'

export function useAvailableWeeks() {
  return useQuery({
    queryKey: ['availableWeeks'],
    queryFn: async () => Array.from({ length: 17 }, (_, index) => index + 1),
    staleTime: Infinity,
    gcTime: Infinity,
  })
}

export function useWeeklyStandings(week, { suppressUnstartedStandings = false } = {}) {
  const matchupsQuery = useSleeperMatchups(week)
  const rostersQuery = useSleeperRosters()
  const usersQuery = useSleeperUsers()
  const playersQuery = usePlayerMap()
  const projectionsQuery = useSleeperProjections({ week })

  const pregameReady = Boolean(
    week &&
    matchupsQuery.data &&
    rostersQuery.data &&
    usersQuery.data,
  )
  const weekStarted = useMemo(
    () => hasWeekStarted(matchupsQuery.data),
    [matchupsQuery.data],
  )
  const standingsReady = Boolean(pregameReady && playersQuery.data)
  const needsStandings = !suppressUnstartedStandings || weekStarted
  const isReady = needsStandings ? standingsReady : pregameReady
  const standings = useMemo(() => {
    if (!standingsReady || (suppressUnstartedStandings && !weekStarted)) return []

    return buildWeeklyStandings({
      matchups: matchupsQuery.data,
      rosters: rostersQuery.data,
      users: usersQuery.data,
      players: playersQuery.data.players,
      projections: projectionsQuery.data?.projections ?? {},
    })
  }, [
    matchupsQuery.data,
    playersQuery.data,
    projectionsQuery.data,
    rostersQuery.data,
    standingsReady,
    usersQuery.data,
    suppressUnstartedStandings,
    weekStarted,
  ])
  const pregameTeams = useMemo(() => {
    if (!rostersQuery.data || !usersQuery.data) return []

    return buildPregameTeams({
      rosters: rostersQuery.data,
      users: usersQuery.data,
      projections: projectionsQuery.data?.projections,
    })
  }, [projectionsQuery.data, rostersQuery.data, usersQuery.data])

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
    ...(needsStandings ? [playersQuery] : []),
  ]

  return {
    data: standings,
    pregameTeams,
    weekStarted,
    isLoading: !isReady && queries.some((query) => query.isPending),
    isFetching: queries.some((query) => query.isFetching),
    error: requiredQueries.find((query) => query.error)?.error ?? null,
    dataUpdatedAt: matchupsQuery.dataUpdatedAt,
    isLivePolling: matchupsQuery.isLivePolling,
    matchupIdentity: matchupsQuery.matchupIdentity,
    matchupSnapshot: matchupsQuery.data,
  }
}
