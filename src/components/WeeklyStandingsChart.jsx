import { useCallback } from 'react'
import BaseChart from './charts/BaseChart'
import { collectTeamNames, fetchWeeklyHistory } from '../lib/weekly-history'
import { useLeagueContext } from '../hooks/useLeagueContext'

export default function WeeklyStandingsChart({ selectedTeam, onTeamSelect }) {
  const { data: leagueContext } = useLeagueContext()
  const fetchWeeklyChartData = useCallback(async () => {
    if (!leagueContext) return { chartData: [], teamNames: [] }

    const weeklyHistory = await fetchWeeklyHistory(
      leagueContext.season,
      leagueContext.league_id
    )
    const teamNames = collectTeamNames(weeklyHistory)

    // Transform data into chart format
    const chartData = []

    weeklyHistory.forEach(({ week, standings }) => {
      if (standings.length > 0) {
        const weekEntry = { week }

        // Add each team's rank for this week
        standings.forEach(team => {
          if (team.team_name && team.rank) {
            weekEntry[team.team_name] = team.rank
          }
        })

        chartData.push(weekEntry)
      }
    })

    return { chartData, teamNames }
  }, [leagueContext])

  return (
    <BaseChart
      title="Weekly Performance Trends"
      fetchDataFn={fetchWeeklyChartData}
      selectedTeam={selectedTeam}
      onTeamSelect={onTeamSelect}
    />
  )
}
