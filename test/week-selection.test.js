import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isMatchupPollingEligible,
  isMatchupQueryEligible,
  isProjectionQueryEligible,
} from '../src/lib/matchup-polling.js'
import {
  getPostseasonPreviewState,
  isPregameEligibleWeek,
  resolveSelectedWeek,
} from '../src/lib/week-selection.js'

const availableWeeks = Array.from({ length: 17 }, (_, index) => index + 1)

test('defaults an empty selection to the display week as a string', () => {
  assert.equal(resolveSelectedWeek({
    selectedWeek: '',
    displayWeek: 4,
    availableWeeks,
  }), '4')
})

test('an automatic selection follows display week changes', () => {
  assert.equal(resolveSelectedWeek({
    selectedWeek: '2',
    displayWeek: 3,
    availableWeeks,
  }), '3')
})

test('preserves an intentional historical selection after display week advances', () => {
  assert.equal(resolveSelectedWeek({
    selectedWeek: '2',
    displayWeek: 5,
    availableWeeks,
    selectionIsManual: true,
  }), '2')
})

test('replaces an invalid manual selection with the display week', () => {
  assert.equal(resolveSelectedWeek({
    selectedWeek: '20',
    displayWeek: '5',
    availableWeeks,
    selectionIsManual: true,
  }), '5')
})

test('displayed and future weeks can use pregame while historical weeks remain ranked', () => {
  assert.equal(isPregameEligibleWeek({ selectedWeek: 3, displayWeek: 3 }), true)
  assert.equal(isPregameEligibleWeek({ selectedWeek: 4, displayWeek: 3 }), true)
  assert.equal(isPregameEligibleWeek({ selectedWeek: 2, displayWeek: 3 }), false)
  assert.equal(isPregameEligibleWeek({ selectedWeek: '', displayWeek: 3 }), false)
})

test('regular-season selections preview both postseason weeks', () => {
  const week16 = getPostseasonPreviewState({
    selectedWeek: 16,
    displayWeek: 15,
    playoffWeekStart: 16,
    postseasonFinalWeek: 17,
  })
  const week17 = getPostseasonPreviewState({
    selectedWeek: 17,
    displayWeek: 15,
    playoffWeekStart: 16,
    postseasonFinalWeek: 17,
  })

  assert.deepEqual(week16, { showPreview: true, weeklyDataEnabled: false })
  assert.deepEqual(week17, { showPreview: true, weeklyDataEnabled: false })
})

test('historical, regular-season, and active postseason weeks retain normal data access', () => {
  const cases = [
    { selectedWeek: 15, displayWeek: 15 },
    { selectedWeek: 16, displayWeek: 16 },
    { selectedWeek: 16, displayWeek: 17 },
    { selectedWeek: 17, displayWeek: 17 },
  ]

  for (const value of cases) {
    assert.deepEqual(getPostseasonPreviewState({
      ...value,
      playoffWeekStart: 16,
      postseasonFinalWeek: 17,
    }), { showPreview: false, weeklyDataEnabled: true })
  }
})

test('postseason preview disables matchup fetches, polling, and projections', () => {
  const preview = getPostseasonPreviewState({
    selectedWeek: 16,
    displayWeek: 15,
    playoffWeekStart: 16,
    postseasonFinalWeek: 17,
  })
  const matchupInputs = {
    enabled: preview.weeklyDataEnabled,
    leagueId: 'league-2026',
    selectedWeek: 16,
    currentWeek: 15,
    visibilityState: 'visible',
    isOnline: true,
  }

  assert.equal(isMatchupQueryEligible(matchupInputs), false)
  assert.equal(isMatchupPollingEligible(matchupInputs), false)
  assert.equal(isProjectionQueryEligible({
    enabled: preview.weeklyDataEnabled,
    season: '2026',
    seasonType: 'regular',
    selectedWeek: 16,
  }), false)

  assert.equal(isMatchupQueryEligible({ ...matchupInputs, enabled: true }), true)
  assert.equal(isMatchupPollingEligible({
    ...matchupInputs,
    enabled: true,
    currentWeek: 16,
  }), true)
  assert.equal(isProjectionQueryEligible({
    enabled: true,
    season: '2026',
    seasonType: 'regular',
    selectedWeek: 16,
  }), true)
})

test('active and display week transitions stop the old stream before following the new week', () => {
  let selectedWeek = resolveSelectedWeek({
    selectedWeek: '',
    displayWeek: 2,
    availableWeeks,
  })
  assert.equal(selectedWeek, '2')
  assert.equal(isMatchupPollingEligible({
    selectedWeek,
    currentWeek: 2,
    visibilityState: 'visible',
    isOnline: true,
  }), true)

  selectedWeek = resolveSelectedWeek({
    selectedWeek,
    displayWeek: 2,
    availableWeeks,
  })
  assert.equal(selectedWeek, '2')
  assert.equal(isMatchupPollingEligible({
    selectedWeek,
    currentWeek: 3,
    visibilityState: 'visible',
    isOnline: true,
  }), false)

  selectedWeek = resolveSelectedWeek({
    selectedWeek,
    displayWeek: 3,
    availableWeeks,
  })
  assert.equal(selectedWeek, '3')
  assert.equal(isMatchupPollingEligible({
    selectedWeek,
    currentWeek: 3,
    visibilityState: 'visible',
    isOnline: true,
  }), true)
})
