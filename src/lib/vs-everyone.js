/**
 * Calculate one week's canonical "vs everyone" results.
 *
 * Tied teams split the wins, losses, and ranks for every position occupied by
 * the tie. JavaScript's stable sort preserves Sleeper's matchup order within a
 * tie, matching the Python calculator.
 */
export function calculateVsEveryone(matchups, teamNames = {}) {
  const teamScores = new Map()

  for (const matchup of matchups ?? []) {
    const rosterId = String(matchup.roster_id)
    teamScores.set(rosterId, {
      roster_id: rosterId,
      team_name: teamNames[rosterId] ?? `Team ${rosterId}`,
      points: Number(matchup.points ?? 0),
    })
  }

  const sortedTeams = [...teamScores.values()].sort(
    (left, right) => right.points - left.points,
  )
  const results = []

  for (let start = 0; start < sortedTeams.length;) {
    let end = start + 1
    while (
      end < sortedTeams.length &&
      sortedTeams[end].points === sortedTeams[start].points
    ) {
      end += 1
    }

    const firstRank = start + 1
    const lastRank = end
    const rank = (firstRank + lastRank) / 2
    const wins = sortedTeams.length - rank
    const losses = rank - 1

    for (let index = start; index < end; index += 1) {
      results.push({
        ...sortedTeams[index],
        rank,
        wins,
        losses,
      })
    }

    start = end
  }

  return results
}

const LINEUP_POSITIONS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'DST']

function formatRecordValue(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)))
}

/**
 * Add the player and formatting fields consumed by WeeklyStandings without
 * coupling the canonical calculation to React or network response state.
 */
export function buildWeeklyStandings({ matchups, rosters, users, players, projections }) {
  const userNames = Object.fromEntries(
    (users ?? []).map((user) => [
      user.user_id,
      user.metadata?.team_name || user.display_name || user.username,
    ]),
  )
  const rosterById = new Map(
    (rosters ?? []).map((roster) => [String(roster.roster_id), roster]),
  )
  const matchupById = new Map(
    (matchups ?? []).map((matchup) => [String(matchup.roster_id), matchup]),
  )
  const teamNames = Object.fromEntries(
    (rosters ?? []).map((roster) => [
      String(roster.roster_id),
      userNames[roster.owner_id] || `Team ${roster.roster_id}`,
    ]),
  )

  return calculateVsEveryone(matchups, teamNames).map((result) => {
    const roster = rosterById.get(result.roster_id) ?? {}
    const matchup = matchupById.get(result.roster_id) ?? {}
    const allPlayers = (roster.players ?? []).map((playerId) => {
      const playerData = players?.[playerId]
      return {
        player_id: playerId,
        player: `${playerData?.first_name || ''} ${playerData?.last_name || ''}`.trim()
          || playerData?.full_name
          || 'Unknown Player',
        position: playerData?.position || 'FLEX',
        team: playerData?.team || '',
        points: matchup.players_points?.[playerId] ?? 0,
        projected_points: projections?.[playerId] || 0,
        is_starter: roster.starters?.includes(playerId) || false,
      }
    })

    const playerById = new Map(allPlayers.map((player) => [player.player_id, player]))
    const starters = (roster.starters ?? []).flatMap((playerId, index) => {
      const player = playerById.get(playerId)
      return player ? [{
        ...player,
        lineup_position: LINEUP_POSITIONS[index] || player.position,
      }] : []
    })
    const projectedTotal = starters.reduce(
      (total, player) => total + Number(player.projected_points || 0),
      0,
    )

    return {
      id: result.roster_id,
      roster_id: roster.roster_id ?? result.roster_id,
      teamName: result.team_name,
      points: result.points.toFixed(2),
      projectedTotal: projectedTotal.toFixed(1),
      starters,
      benchPlayers: allPlayers.filter((player) => !player.is_starter),
      rank: result.rank,
      wins: result.wins,
      losses: result.losses,
      record: `${formatRecordValue(result.wins)}-${formatRecordValue(result.losses)}`,
    }
  })
}
