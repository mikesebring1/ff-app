import assert from 'node:assert/strict'
import test from 'node:test'

import { buildPlayoffMatch } from '../src/lib/playoff-match.js'
import {
  buildOverallRankChart,
  buildWeeklyRankChart,
} from '../src/lib/standings-chart.js'

const weeklyHistory = [
  {
    week: 1,
    standings: [
      { team_id: 1, team_name: 'Same Name', rank: 1, wins: 2, losses: 0, points: 120 },
      { team_id: 2, team_name: 'Same Name', rank: 2, wins: 1, losses: 1, points: 100 },
      { team_id: 3, team_name: 'All Teams', rank: 3, wins: 0, losses: 2, points: 80 },
    ],
  },
  {
    week: 2,
    standings: [
      { team_id: 2, team_name: 'Same Name', rank: 1, wins: 2, losses: 0, points: 130 },
      { team_id: 3, team_name: 'All Teams', rank: 2, wins: 1, losses: 1, points: 90 },
      { team_id: 1, team_name: 'Same Name', rank: 3, wins: 0, losses: 2, points: 70 },
    ],
  },
]

test('weekly chart keeps duplicate team names in distinct roster series', () => {
  const result = buildWeeklyRankChart(weeklyHistory)

  assert.deepEqual(result.teams, [
    {
      rosterId: '1',
      teamName: 'Same Name',
      label: 'Same Name (Roster 1)',
      dataKey: 'roster:1',
    },
    {
      rosterId: '2',
      teamName: 'Same Name',
      label: 'Same Name (Roster 2)',
      dataKey: 'roster:2',
    },
    {
      rosterId: '3',
      teamName: 'All Teams',
      label: 'All Teams (Roster 3)',
      dataKey: 'roster:3',
    },
  ])
  assert.deepEqual(result.chartData, [
    { week: 1, 'roster:1': 1, 'roster:2': 2, 'roster:3': 3 },
    { week: 2, 'roster:2': 1, 'roster:3': 2, 'roster:1': 3 },
  ])
})

test('overall chart accumulates and ranks duplicate names independently', () => {
  const result = buildOverallRankChart(weeklyHistory)

  assert.deepEqual(result.chartData, [
    { week: 1, 'roster:1': 1, 'roster:2': 2, 'roster:3': 3 },
    { week: 2, 'roster:2': 1, 'roster:1': 2, 'roster:3': 3 },
  ])
})

test('playoff matching resolves duplicate names by roster ID', () => {
  const match = buildPlayoffMatch(
    [
      { id: '1', teamName: 'Same Name', points: '91.5', projectedTotal: '98.0' },
      { id: '2', teamName: 'Same Name', points: '105.2', projectedTotal: '104.0' },
    ],
    { id: 1, teamName: 'Same Name' },
    { id: 2, teamName: 'Same Name' },
  )

  assert.equal(match.team1.id, '1')
  assert.equal(match.team2.id, '2')
  assert.equal(match.team1.name, 'Same Name')
  assert.equal(match.team2.name, 'Same Name')
  assert.equal(match.winnerId, '2')
})
