function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export const ALL_TEAMS_SELECTION = 'all-teams'

export function teamSelectionValue(rosterId) {
  return rosterId == null
    ? ALL_TEAMS_SELECTION
    : `roster:${String(rosterId)}`
}

export function rosterIdFromTeamSelection(value) {
  if (value === ALL_TEAMS_SELECTION) return null
  if (typeof value !== 'string' || !value.startsWith('roster:')) return null

  const rosterId = value.slice('roster:'.length)
  return rosterId || null
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

export function withDistinctTeamLabels(teams, reservedLabels = []) {
  const labelCounts = new Map()
  teams.forEach(({ teamName }) => {
    labelCounts.set(teamName, (labelCounts.get(teamName) ?? 0) + 1)
  })
  const reserved = new Set(reservedLabels)
  const cleanLabels = new Set(
    teams
      .filter(({ teamName }) => (
        labelCounts.get(teamName) === 1 && !reserved.has(teamName)
      ))
      .map(({ teamName }) => teamName),
  )
  const unavailableLabels = new Set([...reserved, ...cleanLabels])

  return teams.map((team) => {
    if (cleanLabels.has(team.teamName)) {
      return { ...team, label: team.teamName }
    }

    let attempt = 1
    let label = `${team.teamName} (Roster ${team.rosterId})`
    while (unavailableLabels.has(label)) {
      attempt += 1
      label = `${team.teamName} (Roster ${team.rosterId}, option ${attempt})`
    }
    unavailableLabels.add(label)

    return { ...team, label }
  })
}

export function buildTeamOptions(rosters = [], users = []) {
  const teamNames = buildRosterTeamNames(rosters, users)
  const rosterOptions = withDistinctTeamLabels(
    Object.entries(teamNames).map(([rosterId, teamName]) => ({
      rosterId,
      teamName,
      value: teamSelectionValue(rosterId),
    })),
    ['All Teams'],
  )
    .sort((left, right) => (
      left.label.localeCompare(right.label)
      || left.rosterId.localeCompare(right.rosterId, undefined, { numeric: true })
    ))

  return [{
    label: 'All Teams',
    rosterId: null,
    value: ALL_TEAMS_SELECTION,
  }, ...rosterOptions]
}
