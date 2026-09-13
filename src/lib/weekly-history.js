import { apiCall, apiConfig } from '../config/api'

const WEEKS = Array.from({ length: 18 }, (_, index) => index + 1)

export async function fetchWeeklyHistory(season, leagueId) {
  if (!season || !leagueId) {
    throw new Error('Season and league ID are required for weekly history')
  }

  const results = await Promise.all(
    WEEKS.map((week) => {
      const params = new URLSearchParams({
        week: String(week),
        season,
        league_id: leagueId
      })
      return apiCall(`${apiConfig.endpoints.weekly}?${params}`)
        .catch(() => ({ standings: [] }))
    })
  )

  return WEEKS.map((week, index) => ({
    week,
    standings: results[index].standings || []
  }))
}
