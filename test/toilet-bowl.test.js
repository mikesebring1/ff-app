import assert from 'node:assert/strict'
import test from 'node:test'

import { findToiletBowlQualifierIds } from '../src/lib/toilet-bowl.js'

function qualifierIds(standings) {
  return [...findToiletBowlQualifierIds(standings)].sort()
}

test('only places 5 through 10 can qualify within nine wins of last place', () => {
  const standings = [
    { id: '10', rank: 10, wins: 2 },
    { id: '4', rank: 4, wins: 10 },
    { id: '7', rank: 7, wins: 11.5 },
    { id: '6', rank: 6, wins: 11 },
    { id: '5', rank: 5, wins: 10 },
  ]

  assert.deepEqual(qualifierIds(standings), ['10', '5', '6'])
})

test('fractional wins use an inclusive nine-win cutoff', () => {
  const standings = [
    { id: 5, rank: 5, wins: 31.5 },
    { id: 6, rank: 6, wins: 31.75 },
    { id: 10, rank: 10, wins: 22.5 },
  ]

  assert.deepEqual(qualifierIds(standings), ['10', '5'])
})

test('eligibility remains empty until a tenth-place team is available', () => {
  const standings = [
    { id: '5', rank: 5, wins: 8 },
    { id: '9', rank: 9, wins: 2 },
  ]

  assert.deepEqual(qualifierIds(standings), [])
})
