import { useCallback } from 'react'
import BaseChart from './charts/BaseChart'
import { collectTeamNames, fetchWeeklyHistory } from '../lib/weekly-history'

export default function WeeklyStandingsChart({ selectedTeam, onTeamSelect }) {
  const fetchWeeklyChartData = useCallback(async () => {
    const weeklyHistory = await fetchWeeklyHistory()
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
  }, [])

  return (
    <BaseChart
      title="Weekly Performance Trends"
      fetchDataFn={fetchWeeklyChartData}
      selectedTeam={selectedTeam}
      onTeamSelect={onTeamSelect}
    />
  )
}
