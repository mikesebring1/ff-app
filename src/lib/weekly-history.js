import { apiCall, apiConfig } from '../config/api'

const WEEKS = Array.from({ length: 18 }, (_, index) => index + 1)

export async function fetchWeeklyHistory(season = '2025') {
  const results = await Promise.all(
    WEEKS.map((week) =>
      apiCall(`${apiConfig.endpoints.weekly}?week=${week}&season=${season}`)
        .catch(() => ({ standings: [] }))
    )
  )

  return WEEKS.map((week, index) => ({
    week,
    standings: results[index].standings || []
  }))
}

export function collectTeamNames(weeklyHistory) {
  const names = new Set()

  weeklyHistory.forEach(({ standings }) => {
    standings.forEach((team) => {
      if (team.team_name) {
        names.add(team.team_name)
      }
    })
  })

  return Array.from(names)
}
