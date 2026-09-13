export const PLAYER_MAP_SCHEMA_VERSION = 2

/**
 * Validate the compact player-map contract before standings code consumes it.
 * @param {unknown} value
 * @param {{season?: string, leagueId?: string}} expected
 */
export function parsePlayerMap(value, expected = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Player metadata response must be an object')
  }
  if (value.schema_version !== PLAYER_MAP_SCHEMA_VERSION) {
    throw new Error('Player metadata has an unsupported schema version')
  }
  if (typeof value.season !== 'string' || !value.season) {
    throw new Error('Player metadata is missing season')
  }
  if (typeof value.league_id !== 'string' || !value.league_id) {
    throw new Error('Player metadata is missing league_id')
  }
  if (expected.season && value.season !== expected.season) {
    throw new Error('Player metadata does not match the active season')
  }
  if (expected.leagueId && value.league_id !== expected.leagueId) {
    throw new Error('Player metadata does not match the active league')
  }
  if (!value.players || typeof value.players !== 'object' || Array.isArray(value.players)) {
    throw new Error('Player metadata is missing players')
  }
  if (!Number.isInteger(value.refreshed_at) || value.refreshed_at < 0) {
    throw new Error('Player metadata is missing refreshed_at')
  }

  const playerIds = Object.keys(value.players)
  if (!Number.isInteger(value.player_count) || value.player_count !== playerIds.length) {
    throw new Error('Player metadata count does not match its player map')
  }
  for (const playerId of playerIds) {
    const player = value.players[playerId]
    if (!player || typeof player !== 'object' || Array.isArray(player)) {
      throw new Error(`Player metadata is invalid for ${playerId}`)
    }
    if (typeof player.team !== 'string' || !player.team) {
      throw new Error(`Player metadata is missing an NFL team for ${playerId}`)
    }
    if (String(player.position || '').toUpperCase() === 'K') {
      throw new Error(`Player metadata unexpectedly includes kicker ${playerId}`)
    }
  }

  return value
}
