/**
 * @typedef {Object} LeagueContext
 * @property {string} season
 * @property {number} week
 * @property {number} display_week
 * @property {string} season_type
 * @property {string} league_id
 * @property {string} league_name
 * @property {string} league_status
 * @property {string|null} previous_league_id
 * @property {number} total_rosters
 * @property {Record<string, unknown>} settings
 */

/**
 * Validate the public league-context API contract before using it in queries.
 * @param {unknown} value
 * @returns {LeagueContext}
 */
export function parseLeagueContext(value) {
  if (!value || typeof value !== 'object') {
    throw new Error('League context response must be an object')
  }

  const requiredStrings = [
    'season',
    'season_type',
    'league_id',
    'league_name',
    'league_status'
  ]
  for (const field of requiredStrings) {
    if (typeof value[field] !== 'string' || !value[field]) {
      throw new Error(`League context is missing ${field}`)
    }
  }

  for (const field of ['week', 'display_week', 'total_rosters']) {
    if (!Number.isInteger(value[field]) || value[field] < 1) {
      throw new Error(`League context is missing ${field}`)
    }
  }

  if (!value.settings || typeof value.settings !== 'object' || Array.isArray(value.settings)) {
    throw new Error('League context is missing settings')
  }

  return value
}
