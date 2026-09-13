import assert from 'node:assert/strict'
import test from 'node:test'

import { createSleeperRequestCounter } from '../src/lib/sleeper-request-counter.js'

test('request counter groups actual requests and can be reset', () => {
  const counter = createSleeperRequestCounter()
  counter.record({ resource: 'matchups', queryKey: 'league:1', path: '/matchups/1' })
  counter.record({ resource: 'matchups', queryKey: 'league:1', path: '/matchups/1' })
  counter.record({ resource: 'users', queryKey: 'league', path: '/users' })

  const snapshot = counter.snapshot()
  assert.equal(snapshot.total, 3)
  assert.deepEqual(snapshot.byResource, { matchups: 2, users: 1 })
  assert.deepEqual(snapshot.byQuery, { 'league:1': 2, league: 1 })

  counter.reset()
  assert.equal(counter.snapshot().total, 0)
})
