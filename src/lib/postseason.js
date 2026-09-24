import { findToiletBowlQualifiers } from './toilet-bowl.js'

export const DEFAULT_PLAYOFF_WEEK_START = 16
export const CHAMPIONSHIP_PLAYOFF_TEAM_COUNT = 4
export const POSTSEASON_STANDINGS_REFRESH_MS = 60 * 1000
const DECISION_EPSILON = 1e-6

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function rosterId(value) {
  const id = value?.id ?? value?.roster_id ?? value?.team_id
  return id === null || id === undefined ? null : String(id)
}

function normalizeTeam(team) {
  return {
    ...team,
    id: rosterId(team),
    seed: finiteNumber(team?.rank),
    wins: finiteNumber(team?.wins) ?? 0,
    totalPoints: finiteNumber(team?.totalPoints ?? team?.total_points) ?? 0,
  }
}

export function resolvePostseasonWeeks(settings) {
  const configuredStart = settings?.playoff_week_start
  const startWeek = Number.isInteger(configuredStart) && configuredStart >= 2
    ? configuredStart
    : DEFAULT_PLAYOFF_WEEK_START

  return {
    startWeek,
    finalWeek: startWeek + 1,
  }
}

export function getRegularSeasonStandingsStatus({
  standings,
  playoffWeekStart,
  totalRosters,
}) {
  const rosterCount = Number(totalRosters)
  const startWeek = Number(playoffWeekStart)
  const hasValidLeagueShape = Number.isInteger(rosterCount)
    && rosterCount >= 2
    && Number.isInteger(startWeek)
    && startWeek >= 2
  const expectedDecisions = hasValidLeagueShape
    ? (startWeek - 1) * (rosterCount - 1)
    : null
  const teams = Array.isArray(standings) ? standings : []
  const uniqueRosterIds = new Set(teams.map(rosterId).filter(Boolean))
  const completeTeams = expectedDecisions === null
    ? 0
    : teams.filter((team) => {
      const wins = finiteNumber(team?.wins ?? team?.total_wins)
      const losses = finiteNumber(team?.losses ?? team?.total_losses)
      return wins !== null
        && losses !== null
        && Math.abs((wins + losses) - expectedDecisions) <= DECISION_EPSILON
    }).length
  const hasFullField = hasValidLeagueShape
    && teams.length === rosterCount
    && uniqueRosterIds.size === rosterCount

  return {
    complete: hasFullField && completeTeams === rosterCount,
    completeTeams,
    expectedDecisions,
    totalRosters: hasValidLeagueShape ? rosterCount : null,
  }
}

export function getPostseasonStandingsRefreshInterval({
  monitor,
  standings,
  playoffWeekStart,
  totalRosters,
}) {
  if (!monitor) return false

  const status = getRegularSeasonStandingsStatus({
    standings,
    playoffWeekStart,
    totalRosters,
  })
  return status.complete ? false : POSTSEASON_STANDINGS_REFRESH_MS
}

export function isPostseasonWeekComplete({
  week,
  currentWeek,
  displayWeek,
  leagueStatus,
}) {
  const roundWeek = finiteNumber(week)
  if (roundWeek === null) return false

  if (String(leagueStatus ?? '').toLowerCase() === 'complete') return true

  const active = finiteNumber(currentWeek)
  const displayed = finiteNumber(displayWeek)
  return (active !== null && active > roundWeek)
    || (displayed !== null && displayed > roundWeek)
}

function scoreTeam(team, results) {
  const normalized = normalizeTeam(team)
  const result = (results ?? []).find(
    (candidate) => rosterId(candidate) === normalized.id,
  )

  return {
    ...normalized,
    score: result ? finiteNumber(result.points) : null,
    projectedPoints: result ? finiteNumber(result.projectedTotal) : null,
  }
}

/**
 * Compare teams from best to worst using the league's postseason tiebreakers.
 * Returning zero is intentional: callers must surface an exact tie rather
 * than silently falling back to roster ID or array order.
 */
export function comparePostseasonTeams(left, right) {
  for (const field of ['score', 'wins', 'totalPoints']) {
    const leftValue = finiteNumber(left?.[field])
    const rightValue = finiteNumber(right?.[field])

    if (leftValue === null && rightValue === null) continue
    if (leftValue === null) return 1
    if (rightValue === null) return -1
    if (leftValue !== rightValue) return rightValue - leftValue
  }

  return 0
}

function rankTeams(teams, results) {
  return teams
    .map((team) => scoreTeam(team, results))
    .sort(comparePostseasonTeams)
}

function roundStatus(teams, complete) {
  if (teams.length === 0) return 'missing'
  if (teams.some((team) => team.score === null)) return 'missing'
  if (!complete) {
    return teams.some((team) => team.score !== 0) ? 'live' : 'pregame'
  }
  return 'complete'
}

export function buildPoolRound({
  teams,
  results,
  advanceCount,
  complete,
  expectedTeamCount = teams.length,
}) {
  const rankedTeams = rankTeams(teams, results)
  const status = rankedTeams.length === expectedTeamCount
    ? roundStatus(rankedTeams, complete)
    : 'missing'
  const boundaryIndex = advanceCount - 1
  const boundaryTied = status === 'complete'
    && boundaryIndex >= 0
    && boundaryIndex + 1 < rankedTeams.length
    && comparePostseasonTeams(
      rankedTeams[boundaryIndex],
      rankedTeams[boundaryIndex + 1],
    ) === 0

  return {
    teams: rankedTeams,
    advanceCount,
    status: boundaryTied ? 'unresolved' : status,
    advanced: status === 'complete' && !boundaryTied
      ? rankedTeams.slice(0, advanceCount)
      : [],
    remaining: status === 'complete' && !boundaryTied
      ? rankedTeams.slice(advanceCount)
      : [],
  }
}

export function buildHeadToHeadRound({ teams, results, complete }) {
  if ((teams ?? []).length !== 2) {
    return { teams: [], status: 'missing', winner: null, loser: null }
  }

  const rankedTeams = rankTeams(teams, results)
  const status = roundStatus(rankedTeams, complete)
  const exactTie = status === 'complete'
    && comparePostseasonTeams(rankedTeams[0], rankedTeams[1]) === 0

  return {
    teams: rankedTeams,
    status: exactTie ? 'unresolved' : status,
    winner: status === 'complete' && !exactTie ? rankedTeams[0] : null,
    loser: status === 'complete' && !exactTie ? rankedTeams[1] : null,
  }
}

export function buildChampionshipPostseason({
  standings,
  week16Results,
  week17Results,
  week16Complete,
  week17Complete,
}) {
  const playoffTeams = (standings ?? [])
    .filter((team) => Number(team.rank) >= 1 && Number(team.rank) <= CHAMPIONSHIP_PLAYOFF_TEAM_COUNT)
    .sort((left, right) => Number(left.rank) - Number(right.rank))
    .map(normalizeTeam)

  const qualifyingRound = buildPoolRound({
    teams: playoffTeams,
    results: week16Results,
    advanceCount: 2,
    complete: week16Complete,
    expectedTeamCount: CHAMPIONSHIP_PLAYOFF_TEAM_COUNT,
  })

  const championship = buildHeadToHeadRound({
    teams: qualifyingRound.advanced,
    results: week17Results,
    complete: week17Complete,
  })
  const thirdPlace = buildHeadToHeadRound({
    teams: qualifyingRound.remaining,
    results: week17Results,
    complete: week17Complete,
  })

  return {
    playoffTeams,
    qualifyingRound,
    championship,
    thirdPlace,
  }
}

export function buildPostseasonPreview(standings) {
  const orderedStandings = [...(standings ?? [])]
    .sort((left, right) => Number(left.rank) - Number(right.rank))

  return {
    playoffTeams: orderedStandings
      .filter((team) => Number(team.rank) >= 1 && Number(team.rank) <= CHAMPIONSHIP_PLAYOFF_TEAM_COUNT)
      .map(normalizeTeam),
    toiletBowlTeams: findToiletBowlQualifiers(orderedStandings).map(normalizeTeam),
  }
}

function buildCumulativeRound({ teams, week16Results, week17Results, complete }) {
  const week16Teams = rankTeams(teams, week16Results)
  const week17ById = new Map(
    rankTeams(teams, week17Results).map((team) => [team.id, team]),
  )
  const cumulativeTeams = week16Teams.map((team) => {
    const week17Team = week17ById.get(team.id)
    const availableScores = [team.score, week17Team?.score]
      .filter((score) => score !== null && score !== undefined)

    return {
      ...team,
      week16Score: team.score,
      week17Score: week17Team?.score ?? null,
      score: availableScores.length > 0
        ? availableScores.reduce((total, score) => total + score, 0)
        : null,
    }
  })
  const rankedTeams = cumulativeTeams
    .sort(comparePostseasonTeams)
  const scoresStarted = cumulativeTeams.some(
    (team) => (team.week16Score !== null && team.week16Score !== 0)
      || (team.week17Score !== null && team.week17Score !== 0),
  )
  const missingCompletedScore = cumulativeTeams.some(
    (team) => team.week16Score === null || team.week17Score === null,
  )
  let status = complete
    ? (missingCompletedScore ? 'missing' : 'complete')
    : (scoresStarted ? 'live' : 'pregame')

  if (status === 'complete' && comparePostseasonTeams(rankedTeams[0], rankedTeams[1]) === 0) {
    status = 'unresolved'
  }

  return {
    teams: rankedTeams,
    status,
    lastPlace: status === 'complete' ? rankedTeams[1] : null,
  }
}

export function buildToiletBowl({
  standings,
  week16Results,
  week17Results,
  week16Complete,
  week17Complete,
}) {
  const qualifiers = findToiletBowlQualifiers(standings).map(normalizeTeam)
  const size = qualifiers.length

  if (size === 0) {
    return { format: 'none', qualifiers, status: 'empty', lastPlace: null }
  }

  if (size === 1) {
    return {
      format: 'automatic',
      qualifiers,
      status: 'complete',
      lastPlace: qualifiers[0],
    }
  }

  if (size === 2) {
    const cumulativeRound = buildCumulativeRound({
      teams: qualifiers,
      week16Results,
      week17Results,
      complete: week17Complete,
    })

    return {
      format: 'cumulative',
      qualifiers,
      cumulativeRound,
      status: cumulativeRound.status,
      lastPlace: cumulativeRound.lastPlace,
    }
  }

  const escapeCount = Math.floor(size / 2)
  const qualifyingRound = buildPoolRound({
    teams: qualifiers,
    results: week16Results,
    advanceCount: escapeCount,
    complete: week16Complete,
  })
  if (qualifyingRound.status !== 'complete') {
    return {
      format: 'elimination',
      qualifiers,
      escapeCount,
      qualifyingRound,
      finalRound: {
        teams: [],
        advanceCount: 0,
        status: qualifyingRound.status === 'unresolved' ? 'blocked' : 'pending',
        advanced: [],
        remaining: [],
      },
      status: qualifyingRound.status,
      lastPlace: null,
    }
  }

  const finalRound = buildPoolRound({
    teams: qualifyingRound.remaining,
    results: week17Results,
    advanceCount: Math.max(qualifyingRound.remaining.length - 1, 0),
    complete: week17Complete,
  })
  const lastPlace = finalRound.status === 'complete'
    ? finalRound.remaining[0] ?? null
    : null

  return {
    format: 'elimination',
    qualifiers,
    escapeCount,
    qualifyingRound,
    finalRound,
    status: finalRound.status,
    lastPlace,
  }
}
