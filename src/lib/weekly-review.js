function requiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Weekly review response is missing ${field}`)
  }
  return value.trim()
}

function finiteNumber(value, field) {
  const number = Number(value)
  if (!Number.isFinite(number)) {
    throw new Error(`Weekly review response has invalid ${field}`)
  }
  return number
}

export function parseWeeklyReviewResponse(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Weekly review response must be an object')
  }
  const review = value.review
  if (!review || typeof review !== 'object' || Array.isArray(review)) {
    throw new Error('Weekly review response is missing review')
  }
  if (!Array.isArray(review.teams) || review.teams.length === 0) {
    throw new Error('Weekly review response is missing team recaps')
  }

  const teams = review.teams.map((team) => {
    if (!team || typeof team !== 'object' || Array.isArray(team)) {
      throw new Error('Weekly review response has an invalid team recap')
    }
    return {
      rosterId: requiredString(String(team.roster_id ?? ''), 'roster ID'),
      teamName: requiredString(team.team_name, 'team name'),
      rank: finiteNumber(team.rank, 'rank'),
      points: finiteNumber(team.points, 'points'),
      record: requiredString(team.record, 'record'),
      pointsLeftOnBench: finiteNumber(team.points_left_on_bench, 'bench points'),
      lineupEfficiency: finiteNumber(team.lineup_efficiency, 'lineup efficiency'),
      performance: requiredString(team.performance, 'performance recap'),
      lineup: requiredString(team.lineup, 'lineup recap'),
      verdict: requiredString(team.verdict, 'verdict'),
    }
  })

  return {
    week: finiteNumber(value.week, 'week'),
    generatedAt: finiteNumber(value.generated_at, 'generation timestamp'),
    model: typeof value.model === 'string' ? value.model : null,
    cached: Boolean(value.cached),
    review: {
      headline: requiredString(review.headline, 'headline'),
      overview: requiredString(review.overview, 'overview'),
      teams,
    },
  }
}
