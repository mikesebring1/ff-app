import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildStandingsRouteUrl,
  buildTeamRouteUrl,
  getTeamRouteRosterId,
} from '../src/lib/team-route.js'
import { buildTeamRoster } from '../src/lib/team-roster.js'
import {
  parseTeamSummaryResponse,
  teamSummaryCooldownSeconds,
} from '../src/lib/team-summary.js'

test('team routes preserve other query parameters and the hash', () => {
  const location = {
    pathname: '/standings',
    search: '?season=2026',
    hash: '#week-4',
  }

  const teamUrl = buildTeamRouteUrl(location, '12')
  assert.equal(teamUrl, '/standings?season=2026&team=12#week-4')
  assert.equal(getTeamRouteRosterId({ search: '?season=2026&team=12' }), '12')
  assert.equal(
    buildStandingsRouteUrl({ ...location, search: '?season=2026&team=12' }),
    '/standings?season=2026#week-4',
  )
})

test('empty team routes resolve to the standings view', () => {
  assert.equal(getTeamRouteRosterId({ search: '?team=' }), null)
  assert.equal(getTeamRouteRosterId({ search: '' }), null)
})

test('builds a complete roster grouped by lineup status', () => {
  const team = buildTeamRoster({
    rosterId: 2,
    rosters: [{
      roster_id: 2,
      owner_id: 'owner-2',
      players: ['wr', 'qb', 'rb', 'ir'],
      starters: ['qb', 'wr', '0'],
      reserve: ['ir'],
      taxi: ['taxi'],
    }],
    users: [{
      user_id: 'owner-2',
      display_name: 'Coach',
      metadata: { team_name: 'The Winners' },
    }],
    players: {
      qb: { first_name: 'Quarter', last_name: 'Back', position: 'QB', team: 'GB' },
      rb: { first_name: 'Running', last_name: 'Back', position: 'RB', team: 'DET' },
      wr: { first_name: 'Wide', last_name: 'Receiver', position: 'WR', team: 'MIN' },
      ir: { first_name: 'Injured', last_name: 'Player', position: 'TE', team: 'CHI' },
      taxi: { first_name: 'Taxi', last_name: 'Player', position: 'RB', team: 'DAL' },
    },
    projections: {
      qb: 24.36,
      rb: 11.7,
      wr: 16.1,
    },
  })

  assert.equal(team.teamName, 'The Winners')
  assert.equal(team.ownerName, 'Coach')
  assert.equal(team.playerCount, 5)
  assert.deepEqual(team.starters.map((player) => player.id), ['qb', 'wr'])
  assert.deepEqual(team.starters.map((player) => player.projectedPoints), [24.36, 16.1])
  assert.deepEqual(team.bench.map((player) => player.id), ['rb'])
  assert.equal(team.bench[0].projectedPoints, 11.7)
  assert.deepEqual(team.reserve.map((player) => player.id), ['ir'])
  assert.deepEqual(team.taxi.map((player) => player.id), ['taxi'])
})

test('keeps rostered players visible when compact metadata is unavailable', () => {
  const team = buildTeamRoster({
    rosterId: '1',
    rosters: [{
      roster_id: 1,
      players: ['missing-player'],
      reserve: null,
      starters: null,
      taxi: null,
    }],
  })

  assert.equal(team.bench[0].name, 'Player missing-player')
  assert.equal(team.bench[0].position, 'FLEX')
})

test('validates team summaries and tracks the server cooldown', () => {
  const response = parseTeamSummaryResponse({
    summary: {
      identity: '  A deep receiving team.  ',
      strengths: ['Receiver depth'],
      gaps: ['Running back depth'],
      targets: [{
        player_id: 'free-agent',
        name: 'Free Agent',
        reason: 'Adds depth',
      }],
      strategy: ['Prioritize upside'],
    },
    generated_at: 1_000,
    regenerate_after: 1_900,
    server_time: 1_100,
    cached: true,
  })

  assert.equal(response.summary.identity, 'A deep receiving team.')
  assert.equal(teamSummaryCooldownSeconds(response, response.receivedAt), 800)
  assert.equal(
    teamSummaryCooldownSeconds(response, response.receivedAt + 800_000),
    0,
  )
})

test('rejects incomplete team summaries', () => {
  assert.throws(
    () => parseTeamSummaryResponse({ summary: {}, generated_at: 1, regenerate_after: 2, server_time: 1 }),
    /identity/,
  )
})
