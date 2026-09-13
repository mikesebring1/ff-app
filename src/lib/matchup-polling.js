export const MATCHUP_POLL_INTERVAL_MS = 10_000

export function normalizeWeek(week) {
  const parsed = Number(week)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export function sleeperMatchupQueryKey(leagueId, week) {
  return ['sleeper-matchups', String(leagueId), normalizeWeek(week)]
}

export function isMatchupPollingEligible({
  selectedWeek,
  currentWeek,
  visibilityState,
  isOnline,
}) {
  const selected = normalizeWeek(selectedWeek)
  const current = normalizeWeek(currentWeek)
  return Boolean(
    selected &&
    current &&
    selected === current &&
    visibilityState === 'visible' &&
    isOnline,
  )
}

/**
 * Coordinate one timer for every React Query matchup key. Consumers can share
 * the cached query without each observer creating its own request stream.
 */
export function createMatchupPollingCoordinator({
  intervalMs = MATCHUP_POLL_INTERVAL_MS,
  setIntervalFn = globalThis.setInterval,
  clearIntervalFn = globalThis.clearInterval,
} = {}) {
  const entries = new Map()

  function reconcile(entry, refreshOnResume) {
    const activeSubscription = [...entry.subscriptions.values()].find(
      (subscription) => subscription.enabled,
    )
    const wasRunning = entry.timer !== null

    if (!activeSubscription) {
      if (wasRunning) {
        clearIntervalFn(entry.timer)
        entry.timer = null
      }
      return
    }

    if (!wasRunning) {
      entry.timer = setIntervalFn(() => {
        const current = [...entry.subscriptions.values()].find(
          (subscription) => subscription.enabled,
        )
        current?.refetch()
      }, intervalMs)

      if (refreshOnResume) {
        activeSubscription.refetch()
      }
    }
  }

  return {
    subscribe(queryKey, { enabled, refetch }) {
      const serializedKey = JSON.stringify(queryKey)
      const entry = entries.get(serializedKey) ?? {
        subscriptions: new Map(),
        timer: null,
      }
      entries.set(serializedKey, entry)

      const subscriptionId = Symbol(serializedKey)
      entry.subscriptions.set(subscriptionId, { enabled, refetch })
      reconcile(entry, false)

      return {
        update(nextEnabled) {
          const subscription = entry.subscriptions.get(subscriptionId)
          if (!subscription || subscription.enabled === nextEnabled) return

          subscription.enabled = nextEnabled
          reconcile(entry, true)
        },
        unsubscribe() {
          entry.subscriptions.delete(subscriptionId)
          reconcile(entry, false)
          if (entry.subscriptions.size === 0) {
            entries.delete(serializedKey)
          }
        },
      }
    },
    activeTimerCount() {
      return [...entries.values()].filter((entry) => entry.timer !== null).length
    },
  }
}

export const matchupPollingCoordinator = createMatchupPollingCoordinator()
