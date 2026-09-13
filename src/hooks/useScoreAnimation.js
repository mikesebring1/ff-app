import { useEffect, useRef, useState } from 'react'

import {
  advanceLiveScoreState,
  createLiveScoreState,
} from '../lib/live-score-changes'
import { createScoreFlashController } from '../lib/score-flash-controller'

const SCORE_FLASH_DURATION_MS = 1_100

/**
 * Track score changes from successive network snapshots in the same live
 * league/week stream. Timed entries let a rapid update restart its own flash
 * without stale timers clearing a newer event.
 */
export function useLivePlayerScoreChanges({
  animationsEnabled,
  identity,
  isLive,
  matchups,
  snapshotToken,
}) {
  const comparisonState = useRef(createLiveScoreState())
  const [activeChanges, setActiveChanges] = useState(() => new Map())
  const flashController = useRef(null)
  if (!flashController.current) {
    flashController.current = createScoreFlashController({
      durationMs: SCORE_FLASH_DURATION_MS,
      onChange: setActiveChanges,
    })
  }

  useEffect(() => {
    const result = advanceLiveScoreState(comparisonState.current, {
      identity,
      isLive,
      matchups,
      snapshotToken,
    })
    comparisonState.current = result.state
    flashController.current.update({
      animationsEnabled,
      changes: result.changes,
      identity,
      reset: result.reset,
    })
  }, [animationsEnabled, identity, isLive, matchups, snapshotToken])

  useEffect(() => {
    const controller = flashController.current
    return () => controller.dispose()
  }, [])

  return activeChanges
}
