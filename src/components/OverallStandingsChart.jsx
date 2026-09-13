import { useCallback } from 'react'
import BaseChart from './charts/BaseChart'
import { fetchWeeklyHistory } from '../lib/weekly-history'
import { buildOverallRankChart } from '../lib/standings-chart'
import { useLeagueContext } from '../hooks/useLeagueContext'

export default function OverallStandingsChart({ selectedRosterId, onRosterSelect }) {
  const { data: leagueContext } = useLeagueContext()
  const fetchOverallChartData = useCallback(async () => {
    if (!leagueContext) return { chartData: [], teams: [] }

    const weeklyHistory = await fetchWeeklyHistory(
      leagueContext.season,
      leagueContext.league_id
    )
    return buildOverallRankChart(weeklyHistory)
  }, [leagueContext])

  return (
    <BaseChart
      title="Season-Long Trends"
      fetchDataFn={fetchOverallChartData}
      selectedRosterId={selectedRosterId}
      onRosterSelect={onRosterSelect}
    />
  )
}
