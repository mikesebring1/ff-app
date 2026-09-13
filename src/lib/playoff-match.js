function rosterId(team) {
  const value = team?.id ?? team?.roster_id ?? team?.team_id
  return value == null ? null : String(value)
}

export function buildPlayoffMatch(results, team1, team2) {
  const team1Id = rosterId(team1)
  const team2Id = rosterId(team2)
  if (!team1Id || !team2Id || team1Id === team2Id) return null

  const team1Result = results.find((result) => rosterId(result) === team1Id)
  const team2Result = results.find((result) => rosterId(result) === team2Id)

  if (!team1Result || !team2Result) return null

  return {
    team1: {
      id: team1Id,
      name: team1.teamName,
      points: Number(team1Result.points),
      projectedPoints: Number(team1Result.projectedTotal),
      starters: team1Result.starters || [],
    },
    team2: {
      id: team2Id,
      name: team2.teamName,
      points: Number(team2Result.points),
      projectedPoints: Number(team2Result.projectedTotal),
      starters: team2Result.starters || [],
    },
    winnerId: Number(team1Result.points) > Number(team2Result.points)
      ? team1Id
      : team2Id,
  }
}
