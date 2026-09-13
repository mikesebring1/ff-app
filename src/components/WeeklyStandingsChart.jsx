import { useCallback } from 'react'
import BaseChart from './charts/BaseChart'
import { fetchWeeklyHistory } from '../lib/weekly-history'
import { buildWeeklyRankChart } from '../lib/standings-chart'
import { useLeagueContext } from '../hooks/useLeagueContext'

export default function WeeklyStandingsChart({ selectedRosterId, onRosterSelect }) {
  const { data: leagueContext } = useLeagueContext()
  const fetchWeeklyChartData = useCallback(async () => {
    if (!leagueContext) return { chartData: [], teams: [] }

    const weeklyHistory = await fetchWeeklyHistory(
      leagueContext.season,
      leagueContext.league_id
    )
    return buildWeeklyRankChart(weeklyHistory)
  }, [leagueContext])

  return (
    <BaseChart
      title="Weekly Performance Trends"
      fetchDataFn={fetchWeeklyChartData}
      selectedRosterId={selectedRosterId}
      onRosterSelect={onRosterSelect}
    />
  )
}
