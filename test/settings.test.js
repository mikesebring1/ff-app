import assert from 'node:assert/strict'
import test from 'node:test'

import { buildRosterTeamNames, buildTeamOptions } from '../src/lib/team-names.js'
import {
  normalizeThemePreference,
  resolveDarkMode,
} from '../src/lib/theme-preference.js'

const rosters = [
  { roster_id: 1, owner_id: 'owner-1' },
  { roster_id: 2, owner_id: 'owner-2' },
  { roster_id: 3, owner_id: 'owner-3' },
  { roster_id: 4, owner_id: 'missing-owner' },
]
const users = [
  {
    user_id: 'owner-1',
    display_name: 'Owner One',
    metadata: { team_name: '  Zeta Zone  ' },
  },
  { user_id: 'owner-2', display_name: 'Alpha Squad' },
  { user_id: 'owner-3', username: 'third-owner' },
]

test('builds roster names with the same Sleeper fallback order as standings', () => {
  assert.deepEqual(buildRosterTeamNames(rosters, users), {
    1: 'Zeta Zone',
    2: 'Alpha Squad',
    3: 'third-owner',
    4: 'Team 4',
  })
})

test('builds sorted View as options from current Sleeper rosters and users', () => {
  assert.deepEqual(buildTeamOptions(rosters, users), [
    'All Teams',
    'Alpha Squad',
    'Team 4',
    'third-owner',
    'Zeta Zone',
  ])
})

test('normalizes stored theme preferences and resolves System dynamically', () => {
  assert.equal(normalizeThemePreference('light'), 'light')
  assert.equal(normalizeThemePreference('dark'), 'dark')
  assert.equal(normalizeThemePreference('system'), 'system')
  assert.equal(normalizeThemePreference(null), 'system')
  assert.equal(normalizeThemePreference('unexpected'), 'system')

  assert.equal(resolveDarkMode('light', true), false)
  assert.equal(resolveDarkMode('dark', false), true)
  assert.equal(resolveDarkMode('system', false), false)
  assert.equal(resolveDarkMode('system', true), true)
})
