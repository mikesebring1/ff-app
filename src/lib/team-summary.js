function stringList(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim())
    : []
}

export function parseTeamSummaryResponse(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Team summary response must be an object')
  }
  const summary = value.summary
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    throw new Error('Team summary response is missing summary')
  }
  if (typeof summary.identity !== 'string' || !summary.identity.trim()) {
    throw new Error('Team summary response is missing identity')
  }

  const generatedAt = Number(value.generated_at)
  const regenerateAfter = Number(value.regenerate_after)
  const serverTime = Number(value.server_time)
  if (![generatedAt, regenerateAfter, serverTime].every(Number.isFinite)) {
    throw new Error('Team summary response has invalid timestamps')
  }

  const targets = Array.isArray(summary.targets)
    ? summary.targets.filter((target) => (
      target
      && typeof target === 'object'
      && typeof target.player_id === 'string'
      && typeof target.name === 'string'
      && typeof target.reason === 'string'
    ))
    : []

  return {
    summary: {
      identity: summary.identity.trim(),
      strengths: stringList(summary.strengths),
      gaps: stringList(summary.gaps),
      targets,
      strategy: stringList(summary.strategy),
    },
    generatedAt,
    regenerateAfter,
    serverTime,
    model: typeof value.model === 'string' ? value.model : null,
    cached: Boolean(value.cached),
    cooldownActive: Boolean(value.cooldown_active),
    receivedAt: Date.now(),
  }
}

export function teamSummaryCooldownSeconds(summaryResponse, now = Date.now()) {
  if (!summaryResponse) return 0
  const elapsedSinceResponse = Math.max(0, now - summaryResponse.receivedAt)
  const adjustedNow = summaryResponse.serverTime * 1000 + elapsedSinceResponse
  return Math.max(
    0,
    Math.ceil((summaryResponse.regenerateAfter * 1000 - adjustedNow) / 1000),
  )
}
