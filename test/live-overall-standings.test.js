import assert from 'node:assert/strict'
import test from 'node:test'

import { buildLiveOverallStandings } from '../src/lib/live-overall-standings.js'

test('live overall standings add weekly records and points before reranking', () => {
  const finalized = [
    {
      id: '2', rank: 1, teamName: 'Bravo', wins: 11, losses: 7,
      overallRecord: '11-7', earnings: '$25', totalPoints: '90.00', playoffPct: '72.0%',
    },
    {
      id: '1', rank: 2, teamName: 'Alpha', wins: 10, losses: 8,
      overallRecord: '10-8', earnings: '$0', totalPoints: '100.00', playoffPct: '61.0%',
    },
    {
      id: '3', rank: 3, teamName: 'Charlie', wins: 9, losses: 9,
      overallRecord: '9-9', earnings: '$0', totalPoints: '110.00', playoffPct: '40.0%',
    },
  ]
  const weekly = [
    { id: '1', teamName: 'Alpha Renamed', wins: 2, losses: 0, points: '20.25', rank: 1 },
    { id: '3', teamName: 'Charlie', wins: 1, losses: 1, points: '15.50', rank: 2 },
    { id: '2', teamName: 'Bravo', wins: 0, losses: 2, points: '5.00', rank: 3 },
  ]

  const live = buildLiveOverallStandings(finalized, weekly)

  assert.deepEqual(live.map((team) => ({
    id: team.id,
    rank: team.rank,
    teamName: team.teamName,
    record: team.overallRecord,
    points: team.totalPoints,
    earnings: team.earnings,
    playoffPct: team.playoffPct,
  })), [
    {
      id: '1', rank: 1, teamName: 'Alpha Renamed', record: '12-8',
      points: '120.25', earnings: '$25', playoffPct: '61.0%',
    },
    {
      id: '2', rank: 2, teamName: 'Bravo', record: '11-9',
      points: '95.00', earnings: '$25', playoffPct: '72.0%',
    },
    {
      id: '3', rank: 3, teamName: 'Charlie', record: '10-10',
      points: '125.50', earnings: '$0', playoffPct: '40.0%',
    },
  ])
})

test('live overall standings support a Week 1 baseline and fractional results', () => {
  const live = buildLiveOverallStandings([], [
    { id: '7', teamName: 'Seven', wins: 0.5, losses: 0.5, points: '88.80', rank: 1.5 },
    { id: '9', teamName: 'Nine', wins: 0.5, losses: 0.5, points: '91.25', rank: 1.5 },
  ])

  assert.deepEqual(live.map((team) => ({
    id: team.id,
    rank: team.rank,
    record: team.overallRecord,
    points: team.totalPoints,
    earnings: team.earnings,
  })), [
    { id: '9', rank: 1, record: '0.5-0.5', points: '91.25', earnings: '$0' },
    { id: '7', rank: 2, record: '0.5-0.5', points: '88.80', earnings: '$0' },
  ])
})

test('live overall standings do not mutate their finalized inputs', () => {
  const finalized = [{
    id: '1', rank: 1, teamName: 'One', wins: 3, losses: 0,
    overallRecord: '3-0', earnings: '$1,000', totalPoints: '50.00', playoffPct: '90.0%',
  }]
  const snapshot = structuredClone(finalized)

  const [live] = buildLiveOverallStandings(finalized, [
    { id: '1', teamName: 'One', wins: 1, losses: 0, points: '10.00', rank: 1 },
  ])

  assert.deepEqual(finalized, snapshot)
  assert.equal(live.earnings, '$1025')
})
