import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveSelectedWeek } from '../src/lib/week-selection.js'

const availableWeeks = Array.from({ length: 17 }, (_, index) => index + 1)

test('defaults an empty selection to the current week as a string', () => {
  assert.equal(resolveSelectedWeek({
    selectedWeek: '',
    currentWeek: 5,
    availableWeeks,
  }), '5')
})

test('preserves an intentional historical selection after current week advances', () => {
  assert.equal(resolveSelectedWeek({
    selectedWeek: '2',
    currentWeek: 5,
    availableWeeks,
  }), '2')
})

test('replaces an invalid selection with the current available week', () => {
  assert.equal(resolveSelectedWeek({
    selectedWeek: '20',
    currentWeek: '5',
    availableWeeks,
  }), '5')
})
