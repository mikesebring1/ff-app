import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ALL_TEAMS_SELECTION,
  buildRosterTeamNames,
  buildTeamOptions,
  rosterIdFromTeamSelection,
  teamSelectionValue,
  withDistinctTeamLabels,
} from '../src/lib/team-names.js'
import {
  getThemeStorage,
  normalizeThemePreference,
  persistThemePreference,
  readThemePreference,
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
    { label: 'All Teams', rosterId: null, value: ALL_TEAMS_SELECTION },
    { label: 'Alpha Squad', rosterId: '2', teamName: 'Alpha Squad', value: 'roster:2' },
    { label: 'Team 4', rosterId: '4', teamName: 'Team 4', value: 'roster:4' },
    { label: 'third-owner', rosterId: '3', teamName: 'third-owner', value: 'roster:3' },
    { label: 'Zeta Zone', rosterId: '1', teamName: 'Zeta Zone', value: 'roster:1' },
  ])
})

test('keeps duplicate names and an All Teams roster distinct by roster identity', () => {
  const duplicateUsers = [
    { user_id: 'one', metadata: { team_name: 'Same Name' } },
    { user_id: 'two', metadata: { team_name: 'Same Name' } },
    { user_id: 'three', metadata: { team_name: 'All Teams' } },
  ]
  const duplicateRosters = [
    { roster_id: 1, owner_id: 'one' },
    { roster_id: 2, owner_id: 'two' },
    { roster_id: 3, owner_id: 'three' },
  ]

  assert.deepEqual(buildTeamOptions(duplicateRosters, duplicateUsers), [
    { label: 'All Teams', rosterId: null, value: ALL_TEAMS_SELECTION },
    { label: 'All Teams (Roster 3)', rosterId: '3', teamName: 'All Teams', value: 'roster:3' },
    { label: 'Same Name (Roster 1)', rosterId: '1', teamName: 'Same Name', value: 'roster:1' },
    { label: 'Same Name (Roster 2)', rosterId: '2', teamName: 'Same Name', value: 'roster:2' },
  ])
  assert.equal(rosterIdFromTeamSelection(ALL_TEAMS_SELECTION), null)
  assert.equal(rosterIdFromTeamSelection(teamSelectionValue(3)), '3')
  assert.equal(rosterIdFromTeamSelection('invalid'), null)
})

test('keeps generated roster labels distinct from literal team names', () => {
  const labeledTeams = withDistinctTeamLabels([
    { rosterId: '1', teamName: 'Foo' },
    { rosterId: '2', teamName: 'Foo' },
    { rosterId: '3', teamName: 'Foo (Roster 1)' },
    { rosterId: '4', teamName: 'Foo (Roster 1, option 2)' },
  ])

  assert.deepEqual(labeledTeams.map((team) => team.label), [
    'Foo (Roster 1, option 3)',
    'Foo (Roster 2)',
    'Foo (Roster 1)',
    'Foo (Roster 1, option 2)',
  ])
  assert.equal(new Set(labeledTeams.map((team) => team.label)).size, 4)
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

test('reads and persists theme preferences safely when browser storage is restricted', () => {
  const values = new Map([['theme', 'dark']])
  const storage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  }

  assert.equal(readThemePreference(storage), 'dark')
  assert.equal(persistThemePreference(storage, 'light'), 'light')
  assert.equal(values.get('theme'), 'light')
  assert.equal(persistThemePreference(storage, 'invalid'), 'system')
  assert.equal(values.get('theme'), 'system')

  const restrictedStorage = {
    getItem: () => { throw new Error('blocked') },
    setItem: () => { throw new Error('blocked') },
  }
  assert.equal(readThemePreference(restrictedStorage), 'system')
  assert.equal(persistThemePreference(restrictedStorage, 'dark'), 'dark')

  const restrictedWindow = {}
  Object.defineProperty(restrictedWindow, 'localStorage', {
    get: () => { throw new Error('blocked') },
  })
  assert.equal(getThemeStorage(restrictedWindow), undefined)
})
