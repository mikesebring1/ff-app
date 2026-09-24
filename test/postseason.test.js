import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildChampionshipPostseason,
  buildPostseasonPreview,
  buildToiletBowl,
  getRegularSeasonStandingsStatus,
  getPostseasonStandingsRefreshInterval,
  isPostseasonWeekComplete,
  resolvePostseasonWeeks,
} from '../src/lib/postseason.js'

function team(rank, overrides = {}) {
  return {
    id: String(rank),
    rank,
    teamName: `Team ${rank}`,
    wins: 40 - rank,
    totalPoints: 2000 - rank,
    ...overrides,
  }
}

function scores(entries) {
  return entries.map(([id, points]) => ({
    id: String(id),
    points: String(points),
    projectedTotal: '100',
  }))
}

test('postseason weeks use Sleeper settings with a defensive two-week default', () => {
  assert.deepEqual(resolvePostseasonWeeks({ playoff_week_start: 15 }), {
    startWeek: 15,
    finalWeek: 16,
  })
  assert.deepEqual(resolvePostseasonWeeks({ playoff_week_start: '15' }), {
    startWeek: 16,
    finalWeek: 17,
  })
  assert.deepEqual(resolvePostseasonWeeks(), { startWeek: 16, finalWeek: 17 })
})

test('round completion follows league context instead of calendar time', () => {
  assert.equal(isPostseasonWeekComplete({
    week: 16,
    currentWeek: 16,
    displayWeek: 16,
    leagueStatus: 'in_season',
  }), false)
  assert.equal(isPostseasonWeekComplete({
    week: 16,
    currentWeek: 17,
    displayWeek: 16,
    leagueStatus: 'in_season',
  }), true)
  assert.equal(isPostseasonWeekComplete({
    week: 17,
    currentWeek: 17,
    displayWeek: 17,
    leagueStatus: 'complete',
  }), true)
})

test('regular-season standings require every team to have every expected decision', () => {
  const standings = Array.from({ length: 10 }, (_, index) => ({
    id: String(index + 1),
    wins: 50.5 + index,
    losses: 84.5 - index,
  }))
  const status = getRegularSeasonStandingsStatus({
    standings,
    playoffWeekStart: 16,
    totalRosters: 10,
  })

  assert.deepEqual(status, {
    complete: true,
    completeTeams: 10,
    expectedDecisions: 135,
    totalRosters: 10,
  })
})

test('regular-season standings reject stale, incomplete, and duplicate team fields', () => {
  const completeStandings = Array.from({ length: 10 }, (_, index) => ({
    id: String(index + 1),
    wins: 50 + index,
    losses: 85 - index,
  }))
  const staleStandings = completeStandings.map((team) => ({
    ...team,
    losses: team.losses - 9,
  }))
  const duplicateField = completeStandings.map((team, index) => (
    index === 9 ? { ...team, id: '9' } : team
  ))

  assert.equal(getRegularSeasonStandingsStatus({
    standings: staleStandings,
    playoffWeekStart: 16,
    totalRosters: 10,
  }).complete, false)
  assert.equal(getRegularSeasonStandingsStatus({
    standings: completeStandings.slice(0, 9),
    playoffWeekStart: 16,
    totalRosters: 10,
  }).complete, false)
  assert.equal(getRegularSeasonStandingsStatus({
    standings: duplicateField,
    playoffWeekStart: 16,
    totalRosters: 10,
  }).complete, false)
})

test('postseason standings refresh repeats only while a monitored snapshot is incomplete', () => {
  const completeStandings = Array.from({ length: 10 }, (_, index) => ({
    id: String(index + 1),
    wins: 50 + index,
    losses: 85 - index,
  }))
  const incompleteStandings = completeStandings.map((team) => ({
    ...team,
    losses: team.losses - 9,
  }))
  const common = { playoffWeekStart: 16, totalRosters: 10 }

  assert.equal(getPostseasonStandingsRefreshInterval({
    ...common,
    monitor: true,
    standings: incompleteStandings,
  }), 60_000)
  assert.equal(getPostseasonStandingsRefreshInterval({
    ...common,
    monitor: true,
    standings: completeStandings,
  }), false)
  assert.equal(getPostseasonStandingsRefreshInterval({
    ...common,
    monitor: false,
    standings: incompleteStandings,
  }), false)
})

test('Week 16 championship round advances the two highest scorers as one pool', () => {
  const result = buildChampionshipPostseason({
    standings: [team(1), team(2), team(3), team(4)],
    week16Results: scores([[1, 90], [2, 130], [3, 110], [4, 120]]),
    week17Results: scores([[1, 115], [2, 105], [3, 95], [4, 125]]),
    week16Complete: true,
    week17Complete: true,
  })

  assert.deepEqual(result.qualifyingRound.advanced.map(({ id }) => id), ['2', '4'])
  assert.deepEqual(result.qualifyingRound.remaining.map(({ id }) => id), ['3', '1'])
  assert.equal(result.championship.winner.id, '4')
  assert.equal(result.championship.loser.id, '2')
  assert.equal(result.thirdPlace.winner.id, '1')
  assert.equal(result.thirdPlace.loser.id, '3')
})

test('regular-season record then season points break postseason score ties', () => {
  const standings = [
    team(1, { wins: 50, totalPoints: 1900 }),
    team(2, { wins: 45, totalPoints: 2100 }),
    team(3, { wins: 45, totalPoints: 2050 }),
    team(4, { wins: 30, totalPoints: 2200 }),
  ]
  const result = buildChampionshipPostseason({
    standings,
    week16Results: scores([[1, 100], [2, 100], [3, 100], [4, 90]]),
    week17Results: [],
    week16Complete: true,
    week17Complete: false,
  })

  assert.deepEqual(result.qualifyingRound.advanced.map(({ id }) => id), ['1', '2'])
  assert.deepEqual(result.qualifyingRound.remaining.map(({ id }) => id), ['3', '4'])
})

test('fractional records and season points break a consequential cutoff tie', () => {
  const standings = [
    team(1),
    team(2, { wins: 30.5, totalPoints: 1800.75 }),
    team(3, { wins: 30.5, totalPoints: 1800.5 }),
    team(4),
  ]
  const result = buildChampionshipPostseason({
    standings,
    week16Results: scores([[1, 120], [2, 100], [3, 100], [4, 80]]),
    week17Results: [],
    week16Complete: true,
    week17Complete: false,
  })

  assert.equal(result.qualifyingRound.status, 'complete')
  assert.deepEqual(result.qualifyingRound.advanced.map(({ id }) => id), ['1', '2'])
})

test('live and pregame rounds do not crown winners', () => {
  const standings = [team(1), team(2), team(3), team(4)]
  const pregame = buildChampionshipPostseason({
    standings,
    week16Results: scores([[1, 0], [2, 0], [3, 0], [4, 0]]),
    week17Results: [],
    week16Complete: false,
    week17Complete: false,
  })
  const live = buildChampionshipPostseason({
    standings,
    week16Results: scores([[1, 110], [2, 100], [3, 90], [4, 80]]),
    week17Results: [],
    week16Complete: false,
    week17Complete: false,
  })

  assert.equal(pregame.qualifyingRound.status, 'pregame')
  assert.equal(live.qualifyingRound.status, 'live')
  assert.deepEqual(pregame.qualifyingRound.advanced, [])
  assert.deepEqual(live.qualifyingRound.advanced, [])
})

test('an incomplete four-team playoff field stays unavailable', () => {
  const result = buildChampionshipPostseason({
    standings: [team(1), team(2), team(3)],
    week16Results: scores([[1, 120], [2, 100], [3, 80]]),
    week17Results: [],
    week16Complete: true,
    week17Complete: false,
  })

  assert.equal(result.qualifyingRound.status, 'missing')
  assert.deepEqual(result.qualifyingRound.advanced, [])
})

test('an exact Week 16 cutoff tie remains unresolved', () => {
  const standings = [
    team(1),
    team(2, { wins: 30, totalPoints: 1800 }),
    team(3, { wins: 30, totalPoints: 1800 }),
    team(4),
  ]
  const result = buildChampionshipPostseason({
    standings,
    week16Results: scores([[1, 120], [2, 100], [3, 100], [4, 80]]),
    week17Results: [],
    week16Complete: true,
    week17Complete: false,
  })

  assert.equal(result.qualifyingRound.status, 'unresolved')
  assert.deepEqual(result.qualifyingRound.advanced, [])
  assert.equal(result.championship.status, 'missing')
})

test('an exact Week 17 head-to-head tie requires a manual ruling', () => {
  const standings = [
    team(1, { wins: 30, totalPoints: 1800 }),
    team(2, { wins: 30, totalPoints: 1800 }),
    team(3, { wins: 30, totalPoints: 1800 }),
    team(4),
  ]
  const result = buildChampionshipPostseason({
    standings,
    week16Results: scores([[1, 120], [2, 110], [3, 90], [4, 80]]),
    week17Results: scores([[1, 100], [2, 100], [3, 90], [4, 80]]),
    week16Complete: true,
    week17Complete: true,
  })

  assert.equal(result.championship.status, 'unresolved')
  assert.equal(result.championship.winner, null)
})

test('one Toilet Bowl qualifier automatically finishes last', () => {
  const result = buildToiletBowl({
    standings: [team(10, { wins: 5 })],
    week16Results: [],
    week17Results: [],
    week16Complete: false,
    week17Complete: false,
  })

  assert.equal(result.format, 'automatic')
  assert.equal(result.lastPlace.id, '10')
})

test('two Toilet Bowl qualifiers use the lower Weeks 16-17 cumulative total', () => {
  const result = buildToiletBowl({
    standings: [team(9, { wins: 12 }), team(10, { wins: 5 })],
    week16Results: scores([[9, 70], [10, 100]]),
    week17Results: scores([[9, 110], [10, 85]]),
    week16Complete: true,
    week17Complete: true,
  })

  assert.equal(result.format, 'cumulative')
  assert.equal(result.lastPlace.id, '9')
  assert.deepEqual(
    result.cumulativeRound.teams.map(({ id, score }) => [id, score]),
    [['10', 185], ['9', 180]],
  )
})

test('two-team cumulative ties use record and points and preserve exact ties', () => {
  const brokenByRecord = buildToiletBowl({
    standings: [team(9, { wins: 8 }), team(10, { wins: 5 })],
    week16Results: scores([[9, 90], [10, 100]]),
    week17Results: scores([[9, 100], [10, 90]]),
    week16Complete: true,
    week17Complete: true,
  })
  assert.equal(brokenByRecord.lastPlace.id, '10')

  const exactTie = buildToiletBowl({
    standings: [
      team(9, { wins: 5, totalPoints: 1500 }),
      team(10, { wins: 5, totalPoints: 1500 }),
    ],
    week16Results: scores([[9, 90], [10, 100]]),
    week17Results: scores([[9, 100], [10, 90]]),
    week16Complete: true,
    week17Complete: true,
  })
  assert.equal(exactTie.status, 'unresolved')
  assert.equal(exactTie.lastPlace, null)
})

for (const size of [3, 4, 5, 6]) {
  test(`${size}-team Toilet Bowl flushes ceil(N/2) teams to Week 17`, () => {
    const firstRank = 11 - size
    const standings = Array.from({ length: size }, (_, index) => (
      team(firstRank + index, { wins: 5 })
    ))
    const week16Results = scores(standings.map(({ id }) => [id, 200 - Number(id)]))
    const result = buildToiletBowl({
      standings,
      week16Results,
      week17Results: scores(standings.map(({ id }) => [id, 20 - Number(id)])),
      week16Complete: true,
      week17Complete: true,
    })

    assert.equal(result.format, 'elimination')
    assert.equal(result.qualifyingRound.advanced.length, Math.floor(size / 2))
    assert.equal(result.qualifyingRound.remaining.length, Math.ceil(size / 2))
    assert.equal(result.lastPlace.id, '10')
  })
}

test('an exact Toilet Bowl cutoff tie blocks Week 17 advancement', () => {
  const standings = [
    team(7, { wins: 5, totalPoints: 1700 }),
    team(8, { wins: 5, totalPoints: 1600 }),
    team(9, { wins: 5, totalPoints: 1600 }),
    team(10, { wins: 5, totalPoints: 1400 }),
  ]
  const result = buildToiletBowl({
    standings,
    week16Results: scores([[7, 110], [8, 100], [9, 100], [10, 80]]),
    week17Results: [],
    week16Complete: true,
    week17Complete: false,
  })

  assert.equal(result.qualifyingRound.status, 'unresolved')
  assert.equal(result.finalRound.status, 'blocked')
  assert.equal(result.lastPlace, null)
})

test('an exact Week 17 Toilet Bowl low-score tie remains unresolved', () => {
  const standings = [
    team(7, { wins: 9 }),
    team(8, { wins: 5, totalPoints: 1500 }),
    team(9, { wins: 5, totalPoints: 1500 }),
    team(10, { wins: 4 }),
  ]
  const result = buildToiletBowl({
    standings,
    week16Results: scores([[7, 120], [8, 100], [9, 90], [10, 110]]),
    week17Results: scores([[8, 80], [9, 80]]),
    week16Complete: true,
    week17Complete: true,
  })

  assert.equal(result.finalRound.status, 'unresolved')
  assert.equal(result.lastPlace, null)
})

test('regular-season Week 16 preview shows current playoff and Toilet Bowl fields', () => {
  const standings = Array.from({ length: 10 }, (_, index) => {
    const rank = index + 1
    return team(rank, { wins: rank === 10 ? 2 : 12 - rank })
  })
  const preview = buildPostseasonPreview(standings)

  assert.deepEqual(preview.playoffTeams.map(({ id }) => id), ['1', '2', '3', '4'])
  assert.deepEqual(
    preview.toiletBowlTeams.map(({ id }) => id),
    ['5', '6', '7', '8', '9', '10'],
  )
})

test('postseason preview never moves a top-four team into the Toilet Bowl', () => {
  const standings = [
    team(1, { wins: 20 }),
    team(2, { wins: 19 }),
    team(3, { wins: 18 }),
    team(4, { wins: 10 }),
    team(5, { wins: 12 }),
    team(6, { wins: 11 }),
    team(7, { wins: 11 }),
    team(8, { wins: 10.5 }),
    team(9, { wins: 10 }),
    team(10, { wins: 2 }),
  ]
  const preview = buildPostseasonPreview(standings)

  assert.deepEqual(preview.playoffTeams.map(({ id }) => id), ['1', '2', '3', '4'])
  assert.deepEqual(preview.toiletBowlTeams.map(({ id }) => id), ['6', '7', '8', '9', '10'])
})
