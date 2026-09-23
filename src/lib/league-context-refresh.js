import { createMatchupPollingCoordinator } from './matchup-polling.js'

export const LEAGUE_CONTEXT_REFRESH_INTERVAL_MS = 5 * 60 * 1000

export function isLeagueContextRefreshEligible({
  visibilityState,
  isOnline,
  isFocused,
}) {
  return visibilityState === 'visible' && isOnline && isFocused
}

export function createLeagueContextRefreshCoordinator({
  intervalMs = LEAGUE_CONTEXT_REFRESH_INTERVAL_MS,
  setIntervalFn = globalThis.setInterval,
  clearIntervalFn = globalThis.clearInterval,
} = {}) {
  return createMatchupPollingCoordinator({
    intervalMs,
    setIntervalFn,
    clearIntervalFn,
  })
}

export const leagueContextRefreshCoordinator = createLeagueContextRefreshCoordinator()
