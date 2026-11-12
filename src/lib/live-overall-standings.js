function finiteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function formatStandingNumber(value) {
  const number = finiteNumber(value)
  return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(2)))
}

function parseEarnings(value) {
  if (typeof value === 'number') return finiteNumber(value)
  return finiteNumber(String(value ?? '').replace(/[$,]/g, ''))
}

/**
 * Add the current week's provisional results to the last finalized overall
 * standings. Ordering mirrors the read API: win percentage, then total points.
 */
export function buildLiveOverallStandings(overallStandings, weeklyStandings) {
  const weeklyByRoster = new Map(
    (weeklyStandings ?? []).map((team) => [String(team.id), team]),
  )
  const teamsByRoster = new Map()

  for (const team of overallStandings ?? []) {
    if (team?.id == null) continue
    teamsByRoster.set(String(team.id), { overall: team, order: teamsByRoster.size })
  }

  for (const team of weeklyStandings ?? []) {
    if (team?.id == null) continue
    const rosterId = String(team.id)
    const existing = teamsByRoster.get(rosterId)
    teamsByRoster.set(rosterId, {
      overall: existing?.overall,
      order: existing?.order ?? teamsByRoster.size,
    })
  }

  return [...teamsByRoster.entries()]
    .map(([rosterId, { overall, order }]) => {
      const weekly = weeklyByRoster.get(rosterId)
      const wins = finiteNumber(overall?.wins) + finiteNumber(weekly?.wins)
      const losses = finiteNumber(overall?.losses) + finiteNumber(weekly?.losses)
      const totalPoints = finiteNumber(overall?.totalPoints) + finiteNumber(weekly?.points)
      const totalGames = wins + losses
      const earnings = parseEarnings(overall?.earnings) + (Number(weekly?.rank) === 1 ? 25 : 0)

      return {
        ...overall,
        id: overall?.id ?? weekly?.id,
        teamName: weekly?.teamName ?? overall?.teamName ?? `Team ${rosterId}`,
        wins,
        losses,
        overallRecord: `${formatStandingNumber(wins)}-${formatStandingNumber(losses)}`,
        earnings: `$${formatStandingNumber(earnings)}`,
        totalPoints: totalPoints.toFixed(2),
        playoffPct: overall?.playoffPct ?? '0.0%',
        winPercentage: totalGames > 0 ? wins / totalGames : 0,
        order,
      }
    })
    .sort((left, right) => (
      right.winPercentage - left.winPercentage
      || finiteNumber(right.totalPoints) - finiteNumber(left.totalPoints)
      || left.order - right.order
    ))
    .map((team, index) => {
      const standing = { ...team, rank: index + 1 }
      delete standing.winPercentage
      delete standing.order
      return standing
    })
}
