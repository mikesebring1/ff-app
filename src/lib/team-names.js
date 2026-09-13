function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function getUserTeamName(user) {
  return nonEmptyString(user?.metadata?.team_name)
    || nonEmptyString(user?.display_name)
    || nonEmptyString(user?.username)
}

export function buildRosterTeamNames(rosters = [], users = []) {
  const usersById = new Map(
    users
      .filter((user) => user?.user_id != null)
      .map((user) => [String(user.user_id), user]),
  )

  return Object.fromEntries(
    rosters
      .filter((roster) => roster?.roster_id != null)
      .map((roster) => {
        const rosterId = String(roster.roster_id)
        const owner = usersById.get(String(roster.owner_id))
        return [rosterId, getUserTeamName(owner) || `Team ${rosterId}`]
      }),
  )
}

export function buildTeamOptions(rosters = [], users = []) {
  const teamNames = Object.values(buildRosterTeamNames(rosters, users))
  const uniqueTeamNames = [...new Set(teamNames)]
    .sort((left, right) => left.localeCompare(right))

  return ['All Teams', ...uniqueTeamNames]
}
