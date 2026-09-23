import assert from 'node:assert/strict'
import test from 'node:test'

import {
  LEAGUE_CONTEXT_REFRESH_INTERVAL_MS,
  createLeagueContextRefreshCoordinator,
  isLeagueContextRefreshEligible,
} from '../src/lib/league-context-refresh.js'

test('league context refresh requires an online, visible, focused app', () => {
  const eligible = {
    visibilityState: 'visible',
    isOnline: true,
    isFocused: true,
  }

  assert.equal(isLeagueContextRefreshEligible(eligible), true)
  assert.equal(isLeagueContextRefreshEligible({ ...eligible, visibilityState: 'hidden' }), false)
  assert.equal(isLeagueContextRefreshEligible({ ...eligible, isOnline: false }), false)
  assert.equal(isLeagueContextRefreshEligible({ ...eligible, isFocused: false }), false)
})

test('league context consumers share one five-minute timer and one request per tick', () => {
  const timers = []
  const requests = [0, 0]
  const coordinator = createLeagueContextRefreshCoordinator({
    setIntervalFn: (callback, milliseconds) => {
      const timer = { callback, milliseconds, cleared: false }
      timers.push(timer)
      return timer
    },
    clearIntervalFn: (timer) => {
      timer.cleared = true
    },
  })
  const key = ['league-context']
  const first = coordinator.subscribe(key, {
    enabled: true,
    refetch: () => { requests[0] += 1 },
  })
  const second = coordinator.subscribe(key, {
    enabled: true,
    refetch: () => { requests[1] += 1 },
  })

  assert.equal(timers.length, 1)
  assert.equal(timers[0].milliseconds, LEAGUE_CONTEXT_REFRESH_INTERVAL_MS)
  assert.equal(coordinator.activeTimerCount(), 1)
  timers[0].callback()
  assert.deepEqual(requests, [1, 0])

  first.unsubscribe()
  timers[0].callback()
  assert.deepEqual(requests, [1, 1])
  second.unsubscribe()
  assert.equal(timers[0].cleared, true)
  assert.equal(coordinator.activeTimerCount(), 0)
})

test('backgrounding pauses context refresh and focus resumes it once immediately', () => {
  const timers = []
  let requests = 0
  const coordinator = createLeagueContextRefreshCoordinator({
    setIntervalFn: (callback) => {
      const timer = { callback, cleared: false }
      timers.push(timer)
      return timer
    },
    clearIntervalFn: (timer) => {
      timer.cleared = true
    },
  })
  const key = ['league-context']
  const first = coordinator.subscribe(key, {
    enabled: false,
    refetch: () => { requests += 1 },
  })
  const second = coordinator.subscribe(key, {
    enabled: false,
    refetch: () => { requests += 1 },
  })

  first.update(true)
  second.update(true)
  assert.equal(requests, 1)
  assert.equal(timers.length, 1)

  first.update(false)
  second.update(false)
  assert.equal(timers[0].cleared, true)
  assert.equal(coordinator.activeTimerCount(), 0)

  first.unsubscribe()
  second.unsubscribe()
})
