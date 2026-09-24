const FIRST_ELIGIBLE_RANK = 5
const LAST_PLACE_RANK = 10
const MAX_WIN_DIFFERENCE = 9

/**
 * Return the teams that would enter the Toilet Bowl if the season ended
 * today, ordered by regular-season finish. Championship-playoff teams are
 * excluded even when they are within nine wins of last place.
 */
export function findToiletBowlQualifiers(standings) {
  const lastPlaceTeam = (standings ?? []).find(
    (team) => Number(team.rank) === LAST_PLACE_RANK,
  )
  const lastPlaceWins = Number(lastPlaceTeam?.wins)

  if (!Number.isFinite(lastPlaceWins)) return []

  return standings
    .filter((team) => {
      const rank = Number(team.rank)
      const wins = Number(team.wins)

      return rank >= FIRST_ELIGIBLE_RANK
        && rank <= LAST_PLACE_RANK
        && Number.isFinite(wins)
        && wins <= lastPlaceWins + MAX_WIN_DIFFERENCE
    })
    .sort((left, right) => Number(left.rank) - Number(right.rank))
}

/**
 * Return the roster IDs that would enter the Toilet Bowl if the season ended
 * today. Championship-playoff teams are excluded even when they are within
 * nine wins of last place.
 */
export function findToiletBowlQualifierIds(standings) {
  return new Set(
    findToiletBowlQualifiers(standings)
      .map((team) => String(team.id)),
  )
}
