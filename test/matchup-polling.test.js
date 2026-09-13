import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MATCHUP_POLL_INTERVAL_MS,
  createMatchupPollingCoordinator,
  isMatchupPollingEligible,
  sleeperMatchupQueryKey,
} from '../src/lib/matchup-polling.js'

test('polling requires the current week, a visible document, and an online client', () => {
  const eligible = {
    selectedWeek: '1',
    currentWeek: 1,
    visibilityState: 'visible',
    isOnline: true,
  }

  assert.equal(isMatchupPollingEligible(eligible), true)
  assert.equal(isMatchupPollingEligible({ ...eligible, selectedWeek: 2 }), false)
  assert.equal(isMatchupPollingEligible({ ...eligible, visibilityState: 'hidden' }), false)
  assert.equal(isMatchupPollingEligible({ ...eligible, isOnline: false }), false)
  assert.equal(isMatchupPollingEligible({ ...eligible, selectedWeek: null }), false)
})

test('matchup query keys include normalized league and week identifiers', () => {
  assert.deepEqual(
    sleeperMatchupQueryKey('league-2026', '07'),
    ['sleeper-matchups', 'league-2026', 7],
  )
})

test('duplicate consumers share one ten-second timer and one request per tick', () => {
  const timers = []
  const coordinator = createMatchupPollingCoordinator({
    setIntervalFn: (callback, milliseconds) => {
      const timer = { callback, milliseconds, cleared: false }
      timers.push(timer)
      return timer
    },
    clearIntervalFn: (timer) => {
      timer.cleared = true
    },
  })
  const requests = [0, 0]
  const key = sleeperMatchupQueryKey('league-2026', 1)
  const first = coordinator.subscribe(key, {
    enabled: true,
    refetch: () => { requests[0] += 1 },
  })
  const second = coordinator.subscribe(key, {
    enabled: true,
    refetch: () => { requests[1] += 1 },
  })

  assert.equal(coordinator.activeTimerCount(), 1)
  assert.equal(timers.length, 1)
  assert.equal(timers[0].milliseconds, MATCHUP_POLL_INTERVAL_MS)

  timers[0].callback()
  assert.deepEqual(requests, [1, 0])

  first.unsubscribe()
  timers[0].callback()
  assert.deepEqual(requests, [1, 1])
  assert.equal(coordinator.activeTimerCount(), 1)

  second.unsubscribe()
  assert.equal(timers[0].cleared, true)
  assert.equal(coordinator.activeTimerCount(), 0)
})

test('paused polling has no timer and refreshes immediately on resume', () => {
  const timers = []
  let requests = 0
  const coordinator = createMatchupPollingCoordinator({
    setIntervalFn: (callback, milliseconds) => {
      const timer = { callback, milliseconds, cleared: false }
      timers.push(timer)
      return timer
    },
    clearIntervalFn: (timer) => {
      timer.cleared = true
    },
  })
  const subscription = coordinator.subscribe(
    sleeperMatchupQueryKey('league-2026', 1),
    {
      enabled: false,
      refetch: () => { requests += 1 },
    },
  )

  assert.equal(coordinator.activeTimerCount(), 0)
  subscription.update(true)
  assert.equal(requests, 1)
  assert.equal(coordinator.activeTimerCount(), 1)

  subscription.update(false)
  assert.equal(timers[0].cleared, true)
  assert.equal(coordinator.activeTimerCount(), 0)
  subscription.unsubscribe()
})

test('duplicate paused consumers issue only one immediate resume request', () => {
  let requests = 0
  const coordinator = createMatchupPollingCoordinator({
    setIntervalFn: () => Symbol('timer'),
    clearIntervalFn: () => {},
  })
  const key = sleeperMatchupQueryKey('league-2026', 1)
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
  assert.equal(coordinator.activeTimerCount(), 1)
  first.unsubscribe()
  second.unsubscribe()
})

test('different league or week keys use independent streams', () => {
  const coordinator = createMatchupPollingCoordinator({
    setIntervalFn: () => Symbol('timer'),
    clearIntervalFn: () => {},
  })
  const subscriptions = [
    coordinator.subscribe(sleeperMatchupQueryKey('league-a', 1), { enabled: true, refetch() {} }),
    coordinator.subscribe(sleeperMatchupQueryKey('league-a', 2), { enabled: true, refetch() {} }),
    coordinator.subscribe(sleeperMatchupQueryKey('league-b', 1), { enabled: true, refetch() {} }),
  ]

  assert.equal(coordinator.activeTimerCount(), 3)
  subscriptions.forEach((subscription) => subscription.unsubscribe())
})
