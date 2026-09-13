function finiteScore(value) {
  if (value === null || value === undefined || value === '') return null

  const score = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(score) ? score : null
}

export function playerScoreKey(rosterId, playerId) {
  return `${String(rosterId)}:${String(playerId)}`
}

export function indexPlayerScores(matchups) {
  const scores = new Map()

  for (const matchup of matchups ?? []) {
    if (matchup?.roster_id === null || matchup?.roster_id === undefined) continue

    for (const [playerId, value] of Object.entries(matchup.players_points ?? {})) {
      const score = finiteScore(value)
      if (score !== null) {
        scores.set(playerScoreKey(matchup.roster_id, playerId), score)
      }
    }
  }

  return scores
}

export function buildRankLayout(standings) {
  return (standings ?? []).map((team, index) => ({
    rosterId: String(team.id ?? team.roster_id),
    rank: Number(team.rank),
    order: index,
  }))
}

export function createLiveScoreState() {
  return {
    identity: null,
    active: false,
    snapshotToken: null,
    playerScores: null,
  }
}

/**
 * Advance the comparison baseline for one live matchup stream.
 *
 * Identity changes and inactive periods deliberately discard the baseline.
 * A cached snapshot present during either transition is remembered by token,
 * but never compared with the first network result after the transition.
 */
export function advanceLiveScoreState(previousState, {
  identity,
  isLive,
  matchups,
  snapshotToken,
}) {
  const previous = previousState ?? createLiveScoreState()
  const normalizedIdentity = identity ? String(identity) : null
  const token = snapshotToken || null
  const hasSnapshot = Array.isArray(matchups)

  if (previous.identity !== normalizedIdentity) {
    return {
      state: {
        identity: normalizedIdentity,
        active: Boolean(normalizedIdentity && isLive),
        snapshotToken: token,
        playerScores: null,
      },
      changes: [],
      reset: true,
    }
  }

  if (!normalizedIdentity || !isLive || !hasSnapshot) {
    return {
      state: {
        identity: normalizedIdentity,
        active: false,
        snapshotToken: token,
        playerScores: null,
      },
      changes: [],
      reset: true,
    }
  }

  if (!previous.active) {
    if (token === previous.snapshotToken) {
      return {
        state: { ...previous, active: true, playerScores: null },
        changes: [],
        reset: true,
      }
    }

    return {
      state: {
        identity: normalizedIdentity,
        active: true,
        snapshotToken: token,
        playerScores: indexPlayerScores(matchups),
      },
      changes: [],
      reset: true,
    }
  }

  if (!token || token === previous.snapshotToken) {
    return { state: previous, changes: [], reset: false }
  }

  const playerScores = indexPlayerScores(matchups)
  if (!previous.playerScores) {
    return {
      state: {
        identity: normalizedIdentity,
        active: true,
        snapshotToken: token,
        playerScores,
      },
      changes: [],
      reset: false,
    }
  }

  const changes = []
  for (const [key, score] of playerScores) {
    const previousScore = previous.playerScores.get(key)
    if (previousScore === undefined || score === previousScore) continue

    changes.push({
      key,
      direction: score > previousScore ? 'increase' : 'decrease',
      previousScore,
      score,
      delta: score - previousScore,
    })
  }

  return {
    state: {
      identity: normalizedIdentity,
      active: true,
      snapshotToken: token,
      playerScores,
    },
    changes,
    reset: false,
  }
}
