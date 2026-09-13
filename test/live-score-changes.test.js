import assert from 'node:assert/strict'
import test from 'node:test'

import {
  advanceLiveScoreState,
  buildRankLayout,
  createLiveScoreState,
  indexPlayerScores,
} from '../src/lib/live-score-changes.js'
import { createScoreFlashController } from '../src/lib/score-flash-controller.js'

function snapshot(token, playersPoints, overrides = {}) {
  return {
    identity: 'league-2026:1',
    isLive: true,
    matchups: [{ roster_id: 4, players_points: playersPoints }],
    snapshotToken: token,
    ...overrides,
  }
}

function advance(state, input) {
  return advanceLiveScoreState(state, input)
}

function createFakeScheduler() {
  let currentTime = 0
  let nextTimerId = 0
  const timers = new Map()

  return {
    now: () => currentTime,
    setTimeout(callback, delay) {
      nextTimerId += 1
      timers.set(nextTimerId, {
        active: true,
        callback,
        runAt: currentTime + delay,
      })
      return nextTimerId
    },
    clearTimeout(timerId) {
      const timer = timers.get(timerId)
      if (timer) timer.active = false
    },
    advance(milliseconds) {
      currentTime += milliseconds
      for (const timer of timers.values()) {
        if (timer.active && timer.runAt <= currentTime) {
          timer.active = false
          timer.callback()
        }
      }
    },
    callback(timerId) {
      return timers.get(timerId)?.callback
    },
    pendingCount() {
      return Array.from(timers.values()).filter((timer) => timer.active).length
    },
  }
}

function scoreChange(key, direction = 'increase') {
  return {
    key,
    direction,
    previousScore: 1,
    score: direction === 'increase' ? 2 : 0,
    delta: direction === 'increase' ? 1 : -1,
  }
}

test('establishing a live identity never reports its current snapshot as a change', () => {
  let result = advance(createLiveScoreState(), snapshot('initial', { player1: 3.2 }))
  assert.equal(result.reset, true)
  assert.deepEqual(result.changes, [])

  result = advance(result.state, snapshot('poll-1', { player1: 3.2 }))
  assert.deepEqual(result.changes, [])
})

test('decimal increases and decreases report their direction and exact scores', () => {
  let result = advance(createLiveScoreState(), snapshot(null, null, { matchups: undefined }))
  result = advance(result.state, snapshot('baseline', { player1: 3.2 }))
  assert.deepEqual(result.changes, [])

  result = advance(result.state, snapshot('increase', { player1: 4.7 }))
  assert.deepEqual(result.changes, [{
    key: '4:player1',
    direction: 'increase',
    previousScore: 3.2,
    score: 4.7,
    delta: 1.5,
  }])

  result = advance(result.state, snapshot('decrease', { player1: 3.7 }))
  assert.equal(result.changes.length, 1)
  assert.equal(result.changes[0].direction, 'decrease')
  assert.equal(result.changes[0].previousScore, 4.7)
  assert.equal(result.changes[0].score, 3.7)
  assert.ok(Math.abs(result.changes[0].delta + 1) < Number.EPSILON * 4)
})

test('zero changes do nothing while negative-score transitions remain comparable', () => {
  let result = advance(createLiveScoreState(), snapshot(null, null, { matchups: undefined }))
  result = advance(result.state, snapshot('baseline', { player1: -1.5 }))
  result = advance(result.state, snapshot('same', { player1: -1.5 }))
  assert.deepEqual(result.changes, [])

  result = advance(result.state, snapshot('more-negative', { player1: -3 }))
  assert.equal(result.changes[0].direction, 'decrease')

  result = advance(result.state, snapshot('less-negative', { player1: -0.5 }))
  assert.equal(result.changes[0].direction, 'increase')
})

test('missing, invalid, and newly appearing players never create a false change', () => {
  let result = advance(createLiveScoreState(), snapshot(null, null, { matchups: undefined }))
  result = advance(result.state, snapshot('baseline', {
    stable: 2,
    missingLater: 4,
    invalid: 'not-a-score',
  }))
  result = advance(result.state, snapshot('players-change', {
    stable: 2,
    newPlayer: 9,
    invalid: 1,
  }))
  assert.deepEqual(result.changes, [])

  result = advance(result.state, snapshot('new-player-update', {
    stable: 2,
    newPlayer: 10,
  }))
  assert.deepEqual(result.changes.map((change) => change.key), ['4:newPlayer'])
})

test('moving a player to another roster establishes a new stable identity', () => {
  let result = advance(createLiveScoreState(), snapshot(null, null, { matchups: undefined }))
  result = advance(result.state, snapshot('baseline', { player1: 5 }))
  result = advance(result.state, snapshot('moved', {}, {
    matchups: [{ roster_id: 8, players_points: { player1: 6 } }],
  }))

  assert.deepEqual(result.changes, [])
})

test('duplicate tokens are ignored so Strict Mode cannot replay a change', () => {
  let result = advance(createLiveScoreState(), snapshot(null, null, { matchups: undefined }))
  result = advance(result.state, snapshot('baseline', { player1: 1 }))
  result = advance(result.state, snapshot('changed', { player1: 2 }))
  assert.equal(result.changes.length, 1)

  result = advance(result.state, snapshot('changed', { player1: 2 }))
  assert.deepEqual(result.changes, [])
})

test('historical views, context switches, and cached restores reset the baseline', () => {
  let result = advance(createLiveScoreState(), snapshot(null, null, { matchups: undefined }))
  result = advance(result.state, snapshot('baseline', { player1: 1 }))
  result = advance(result.state, snapshot('historical', { player1: 8 }, {
    identity: 'league-2026:2',
    isLive: false,
  }))
  assert.equal(result.reset, true)
  assert.deepEqual(result.changes, [])

  result = advance(result.state, snapshot('cached-current', { player1: 8 }))
  assert.equal(result.reset, true)
  result = advance(result.state, snapshot('fresh-current', { player1: 9 }))
  assert.deepEqual(result.changes, [])
  result = advance(result.state, snapshot('next-live', { player1: 10 }))
  assert.equal(result.changes[0].direction, 'increase')

  result = advance(result.state, snapshot('paused', { player1: 10 }, { isLive: false }))
  result = advance(result.state, snapshot('paused', { player1: 10 }))
  result = advance(result.state, snapshot('resume-refresh', { player1: 11 }))
  assert.deepEqual(result.changes, [])
  result = advance(result.state, snapshot('resume-next', { player1: 10 }))
  assert.equal(result.changes[0].direction, 'decrease')
})

test('score indexing keeps roster and player identity separate', () => {
  const scores = indexPlayerScores([
    { roster_id: 1, players_points: { shared: 2 } },
    { roster_id: 2, players_points: { shared: 7 } },
  ])

  assert.deepEqual([...scores], [['1:shared', 2], ['2:shared', 7]])
})

test('rank layout data follows canonical order with stable roster identities', () => {
  const before = buildRankLayout([
    { id: '10', rank: 1 },
    { id: '20', rank: 2 },
  ])
  const after = buildRankLayout([
    { id: '20', rank: 1 },
    { id: '10', rank: 2 },
  ])

  assert.deepEqual(before, [
    { rosterId: '10', rank: 1, order: 0 },
    { rosterId: '20', rank: 2, order: 1 },
  ])
  assert.deepEqual(after, [
    { rosterId: '20', rank: 1, order: 0 },
    { rosterId: '10', rank: 2, order: 1 },
  ])
})

test('rapid updates extend only the affected flash and stale callbacks cannot clear it', () => {
  const scheduler = createFakeScheduler()
  const published = []
  const controller = createScoreFlashController({
    durationMs: 1_100,
    now: scheduler.now,
    onChange: (changes) => published.push(changes),
    setTimeoutFn: scheduler.setTimeout,
    clearTimeoutFn: scheduler.clearTimeout,
  })

  controller.update({
    animationsEnabled: true,
    changes: [scoreChange('4:player1'), scoreChange('4:player2')],
    identity: 'league-2026:1',
    reset: false,
  })
  const firstPlayerTimer = scheduler.callback(1)
  const firstSequence = controller.snapshot().get('4:player1').sequence

  scheduler.advance(400)
  controller.update({
    animationsEnabled: true,
    changes: [scoreChange('4:player1', 'decrease')],
    identity: 'league-2026:1',
    reset: false,
  })

  const extendedFlash = controller.snapshot().get('4:player1')
  assert.ok(extendedFlash.sequence > firstSequence)
  assert.equal(extendedFlash.expiresAt, 1_500)
  assert.equal(controller.snapshot().get('4:player2').expiresAt, 1_100)

  firstPlayerTimer()
  assert.equal(controller.snapshot().get('4:player1').sequence, extendedFlash.sequence)

  scheduler.advance(700)
  assert.equal(controller.snapshot().has('4:player2'), false)
  assert.equal(controller.snapshot().has('4:player1'), true)

  scheduler.advance(400)
  assert.equal(controller.snapshot().size, 0)
  assert.equal(scheduler.pendingCount(), 0)
  assert.ok(published.length >= 4)
})

test('a reduced-motion transition clears active flashes and their timers immediately', () => {
  const scheduler = createFakeScheduler()
  const controller = createScoreFlashController({
    durationMs: 1_100,
    now: scheduler.now,
    setTimeoutFn: scheduler.setTimeout,
    clearTimeoutFn: scheduler.clearTimeout,
  })
  controller.update({
    animationsEnabled: true,
    changes: [scoreChange('4:player1')],
    identity: 'league-2026:1',
    reset: false,
  })

  controller.update({
    animationsEnabled: false,
    changes: [],
    identity: 'league-2026:1',
    reset: false,
  })

  assert.equal(controller.snapshot().size, 0)
  assert.equal(scheduler.pendingCount(), 0)
})

test('disposing the flash controller clears every timer without late publications', () => {
  const scheduler = createFakeScheduler()
  let publishCount = 0
  const controller = createScoreFlashController({
    durationMs: 1_100,
    now: scheduler.now,
    onChange: () => { publishCount += 1 },
    setTimeoutFn: scheduler.setTimeout,
    clearTimeoutFn: scheduler.clearTimeout,
  })
  controller.update({
    animationsEnabled: true,
    changes: [scoreChange('4:player1'), scoreChange('4:player2')],
    identity: 'league-2026:1',
    reset: false,
  })
  const callbacks = [scheduler.callback(1), scheduler.callback(2)]

  controller.dispose()
  assert.equal(controller.snapshot().size, 0)
  assert.equal(scheduler.pendingCount(), 0)

  callbacks.forEach((callback) => callback())
  scheduler.advance(2_000)
  assert.equal(publishCount, 1)
})
