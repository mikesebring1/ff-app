import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import test from 'node:test'

import { parsePlayerMap, PLAYER_MAP_SCHEMA_VERSION } from '../src/lib/player-map.js'

const validPlayerMap = {
  season: '2026',
  league_id: 'league-2026',
  schema_version: PLAYER_MAP_SCHEMA_VERSION,
  refreshed_at: 1_789_000_000,
  player_count: 1,
  players: {
    '4046': {
      first_name: 'Patrick',
      last_name: 'Mahomes',
      position: 'QB',
      team: 'KC',
    },
  },
}

test('accepts a compact player map for the active league season', () => {
  assert.equal(
    parsePlayerMap(validPlayerMap, { season: '2026', leagueId: 'league-2026' }),
    validPlayerMap,
  )
})

test('rejects stale context and invalid filtered entries', () => {
  assert.throws(
    () => parsePlayerMap(validPlayerMap, { season: '2027', leagueId: 'league-2026' }),
    /active season/,
  )
  assert.throws(
    () => parsePlayerMap({
      ...validPlayerMap,
      players: { kicker: { position: 'K', team: 'KC' } },
    }),
    /kicker/,
  )
})

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => {
    const entryPath = path.join(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(entryPath) : [entryPath]
  }))
  return nested.flat()
}

test('browser source never requests Sleeper full player directory', async () => {
  const files = await sourceFiles(fileURLToPath(new URL('../src', import.meta.url)))
  const contents = await Promise.all(files.map((file) => readFile(file, 'utf8')))
  assert.equal(contents.some((content) => content.includes('/players/nfl')), false)
})
