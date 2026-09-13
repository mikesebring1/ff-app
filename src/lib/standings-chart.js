import { withDistinctTeamLabels } from './team-names.js'

export function standingRosterId(team) {
  const rosterId = team?.team_id ?? team?.roster_id ?? team?.id
  return rosterId == null ? null : String(rosterId)
}

export function teamSeriesKey(rosterId) {
  return `roster:${String(rosterId)}`
}

export function collectTeamSeries(weeklyHistory) {
  const teamsByRoster = new Map()

  weeklyHistory.forEach(({ standings }) => {
    standings.forEach((team) => {
      const rosterId = standingRosterId(team)
      if (rosterId && team.team_name) {
        teamsByRoster.set(rosterId, {
          rosterId,
          teamName: team.team_name,
        })
      }
    })
  })

  return withDistinctTeamLabels([...teamsByRoster.values()], ['All Teams'])
    .map((team) => ({ ...team, dataKey: teamSeriesKey(team.rosterId) }))
}

export function buildWeeklyRankChart(weeklyHistory) {
  const teams = collectTeamSeries(weeklyHistory)
  const knownRosterIds = new Set(teams.map((team) => team.rosterId))
  const chartData = []

  weeklyHistory.forEach(({ week, standings }) => {
    if (!standings.length) return

    const weekEntry = { week }
    standings.forEach((team) => {
      const rosterId = standingRosterId(team)
      if (knownRosterIds.has(rosterId) && team.rank != null) {
        weekEntry[teamSeriesKey(rosterId)] = team.rank
      }
    })
    chartData.push(weekEntry)
  })

  return { chartData, teams }
}

export function buildOverallRankChart(weeklyHistory) {
  const teams = collectTeamSeries(weeklyHistory)
  const teamWins = new Map(teams.map((team) => [team.rosterId, 0]))
  const teamLosses = new Map(teams.map((team) => [team.rosterId, 0]))
  const chartData = []

  weeklyHistory.forEach(({ week, standings }) => {
    if (!standings.length) return

    standings.forEach((team) => {
      const rosterId = standingRosterId(team)
      if (
        teamWins.has(rosterId)
        && team.wins !== undefined
        && team.losses !== undefined
      ) {
        teamWins.set(rosterId, teamWins.get(rosterId) + Number(team.wins || 0))
        teamLosses.set(rosterId, teamLosses.get(rosterId) + Number(team.losses || 0))
      }
    })

    const teamStats = standings.flatMap((team) => {
      const rosterId = standingRosterId(team)
      if (!teamWins.has(rosterId)) return []

      const wins = teamWins.get(rosterId)
      const losses = teamLosses.get(rosterId)
      return [{
        rosterId,
        winPct: wins / Math.max(1, wins + losses),
        totalPoints: Number(team.points || 0),
      }]
    })

    teamStats.sort((left, right) => {
      if (Math.abs(left.winPct - right.winPct) < 0.001) {
        return right.totalPoints - left.totalPoints
      }
      return right.winPct - left.winPct
    })

    const weekEntry = { week }
    teamStats.forEach((team, index) => {
      weekEntry[teamSeriesKey(team.rosterId)] = index + 1
    })
    chartData.push(weekEntry)
  })

  return { chartData, teams }
}
