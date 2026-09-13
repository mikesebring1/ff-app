import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { buildWeeklyStandings, calculateVsEveryone } from '../src/lib/vs-everyone.js'

const fixturesUrl = new URL(
  '../packages/ff-standings/fixtures/weekly-standings.json',
  import.meta.url,
)
const fixtures = JSON.parse(await readFile(fixturesUrl, 'utf8'))

for (const fixture of fixtures.cases) {
  test(`JavaScript calculator: ${fixture.name}`, () => {
    assert.deepEqual(
      calculateVsEveryone(fixture.matchups, fixture.team_names),
      fixture.expected,
    )
  })
}

test('weekly adapter preserves the component shape and fractional record', () => {
  const standings = buildWeeklyStandings({
    matchups: [
      { roster_id: 1, points: 10.25, players_points: { qb1: 10.25 } },
      { roster_id: 2, points: 10.25, players_points: { qb2: 10.25 } },
    ],
    rosters: [
      { roster_id: 1, owner_id: 'user1', players: ['qb1', 'bench1'], starters: ['qb1'] },
      { roster_id: 2, owner_id: 'user2', players: ['qb2'], starters: ['qb2'] },
    ],
    users: [
      { user_id: 'user1', metadata: { team_name: 'First Team' } },
      { user_id: 'user2', display_name: 'Second Team' },
    ],
    players: {
      qb1: { first_name: 'Ada', last_name: 'Quarterback', position: 'QB', team: 'GB' },
      qb2: { full_name: 'Grace Quarterback', position: 'QB', team: 'NYG' },
      bench1: { full_name: 'Bench Player', position: 'WR', team: 'CHI' },
    },
    projections: { qb1: 17.45, qb2: 18.04, bench1: 4.5 },
  })

  assert.equal(standings[0].id, '1')
  assert.equal(standings[0].roster_id, 1)
  assert.equal(standings[0].teamName, 'First Team')
  assert.equal(standings[0].points, '10.25')
  assert.equal(standings[0].projectedTotal, '17.4')
  assert.equal(standings[0].rank, 1.5)
  assert.equal(standings[0].record, '0.5-0.5')
  assert.equal(standings[0].starters[0].lineup_position, 'QB')
  assert.equal(standings[0].starters[0].player, 'Ada Quarterback')
  assert.equal(standings[0].benchPlayers[0].player, 'Bench Player')
})
