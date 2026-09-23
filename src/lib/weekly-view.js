import { buildRosterTeamNames } from './team-names.js'

function finiteScore(value) {
  if (value === null || value === undefined || value === '') return null

  const score = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(score) ? score : null
}

/**
 * Treat a week as started only when Sleeper reports an actual nonzero score.
 * Player scores are checked independently because team totals can lag behind
 * the player-level matchup payload at kickoff.
 */
export function hasWeekStarted(matchups) {
  return (matchups ?? []).some((matchup) => {
    const teamScore = finiteScore(matchup?.points)
    if (teamScore !== null && teamScore !== 0) return true

    return Object.values(matchup?.players_points ?? {}).some((value) => {
      const playerScore = finiteScore(value)
      return playerScore !== null && playerScore !== 0
    })
  })
}

/**
 * Build an intentionally unranked team list for the pregame crystal ball.
 * Sleeper roster order is stable and carries no projected-strength ordering.
 */
export function buildPregameTeams({ rosters, users, projections }) {
  const teamNames = buildRosterTeamNames(rosters, users)
  const projectionsAvailable = projections !== null && projections !== undefined

  return (rosters ?? []).map((roster) => {
    const rosterId = String(roster.roster_id)
    const projectedTotal = projectionsAvailable
      ? (roster.starters ?? []).reduce((total, playerId) => {
          const projection = finiteScore(projections[playerId])
          return total + (projection ?? 0)
        }, 0)
      : null

    return {
      rosterId,
      teamName: teamNames[rosterId] ?? `Team ${rosterId}`,
      projectedTotal: projectedTotal === null ? null : projectedTotal.toFixed(1),
    }
  })
}
