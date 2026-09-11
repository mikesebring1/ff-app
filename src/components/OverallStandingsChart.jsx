import { useCallback } from 'react'
import BaseChart from './charts/BaseChart'
import { collectTeamNames, fetchWeeklyHistory } from '../lib/weekly-history'

export default function OverallStandingsChart({ selectedTeam, onTeamSelect }) {
  const fetchOverallChartData = useCallback(async () => {
    const weeklyHistory = await fetchWeeklyHistory()
    const teamNames = collectTeamNames(weeklyHistory)

    // Extract unique team names and initialize cumulative data
    const teamWins = {}
    const teamLosses = {}

    teamNames.forEach((teamName) => {
      teamWins[teamName] = 0
      teamLosses[teamName] = 0
    })

    // Calculate cumulative overall standings after each week
    const chartData = []

    weeklyHistory.forEach(({ week, standings }) => {
      if (standings.length > 0) {
        // For each week, we get the WEEKLY wins/losses, so we add them to cumulative totals
        standings.forEach(team => {
          if (team.team_name && team.wins !== undefined && team.losses !== undefined) {
            // These are weekly wins/losses for this specific week, so we accumulate them
            teamWins[team.team_name] = (teamWins[team.team_name] || 0) + parseFloat(team.wins || 0)
            teamLosses[team.team_name] = (teamLosses[team.team_name] || 0) + parseFloat(team.losses || 0)
          }
        })
        
        // Calculate rankings based on cumulative wins (and total points as tiebreaker)
        const teamStats = []
        standings.forEach(team => {
          if (team.team_name) {
            teamStats.push({
              name: team.team_name,
              wins: teamWins[team.team_name] || 0,
              losses: teamLosses[team.team_name] || 0,
              winPct: (teamWins[team.team_name] || 0) / Math.max(1, (teamWins[team.team_name] || 0) + (teamLosses[team.team_name] || 0)),
              totalPoints: parseFloat(team.points || 0) // Use current week points as proxy for total
            })
          }
        })
        
        // Sort by win percentage, then by total points
        teamStats.sort((a, b) => {
          if (Math.abs(a.winPct - b.winPct) < 0.001) {
            return b.totalPoints - a.totalPoints
          }
          return b.winPct - a.winPct
        })
        
        // Create week entry with rankings
        const weekEntry = { week }
        teamStats.forEach((team, index) => {
          weekEntry[team.name] = index + 1
        })
        
        chartData.push(weekEntry)
      }
    })

    return { chartData, teamNames }
  }, [])

  return (
    <BaseChart
      title="Season-Long Trends"
      fetchDataFn={fetchOverallChartData}
      selectedTeam={selectedTeam}
      onTeamSelect={onTeamSelect}
    />
  )
}
