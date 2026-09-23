import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildPregameTeams,
  hasWeekStarted,
} from '../src/lib/weekly-view.js'

test('all-zero and invalid matchup scores leave the week unstarted', () => {
  assert.equal(hasWeekStarted([
    {
      roster_id: 1,
      points: '0',
      players_points: { qb: 0, rb: '0.0', bad: 'not-a-score' },
    },
    { roster_id: 2, points: null, players_points: {} },
  ]), false)
})

test('a negative team score counts as the start of scoring', () => {
  assert.equal(hasWeekStarted([{ roster_id: 1, points: -1 }]), true)
})

test('a nonzero player score counts even while its team total is zero', () => {
  assert.equal(hasWeekStarted([
    { roster_id: 1, points: 0, players_points: { defense: -2 } },
  ]), true)
})

test('pregame teams retain neutral roster order and sum starter projections', () => {
  const teams = buildPregameTeams({
    rosters: [
      { roster_id: 7, owner_id: 'b', starters: ['qb2', 'rb2'] },
      { roster_id: 2, owner_id: 'a', starters: ['qb1'] },
    ],
    users: [
      { user_id: 'a', metadata: { team_name: 'Second in payload' } },
      { user_id: 'b', metadata: { team_name: 'First in payload' } },
    ],
    projections: { qb1: 18.24, qb2: 20, rb2: 11.55 },
  })

  assert.deepEqual(teams, [
    { rosterId: '7', teamName: 'First in payload', projectedTotal: '31.6' },
    { rosterId: '2', teamName: 'Second in payload', projectedTotal: '18.2' },
  ])
})

test('pregame team names render without projections when the feed is unavailable', () => {
  assert.deepEqual(buildPregameTeams({
    rosters: [{ roster_id: 1, owner_id: 'owner', starters: ['qb'] }],
    users: [{ user_id: 'owner', display_name: 'Fallback Name' }],
    projections: undefined,
  }), [{
    rosterId: '1',
    teamName: 'Fallback Name',
    projectedTotal: null,
  }])
})
