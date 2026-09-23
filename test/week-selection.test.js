import assert from 'node:assert/strict'
import test from 'node:test'

import { isMatchupPollingEligible } from '../src/lib/matchup-polling.js'
import {
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
