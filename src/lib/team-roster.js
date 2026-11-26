import { buildRosterTeamNames } from './team-names.js'

const POSITION_ORDER = new Map([
  ['QB', 0],
  ['RB', 1],
  ['WR', 2],
  ['TE', 3],
  ['FLEX', 4],
  ['K', 5],
  ['DEF', 6],
])

function playerName(player, playerId) {
  return `${player?.first_name || ''} ${player?.last_name || ''}`.trim()
    || player?.full_name
    || `Player ${playerId}`
}

function sortPlayers(left, right) {
  const leftPosition = POSITION_ORDER.get(left.position) ?? POSITION_ORDER.size
  const rightPosition = POSITION_ORDER.get(right.position) ?? POSITION_ORDER.size

  return leftPosition - rightPosition
    || left.name.localeCompare(right.name)
    || left.id.localeCompare(right.id, undefined, { numeric: true })
}

function ownerName(owner) {
  return owner?.display_name?.trim()
    || owner?.username?.trim()
    || null
}

function normalizePlayerIds(playerIds = []) {
  return (playerIds ?? [])
    .filter((playerId) => playerId != null)
    .map(String)
    .filter((playerId) => playerId && playerId !== '0')
}

export function buildTeamRoster({
  rosterId,
  rosters = [],
  users = [],
  players = {},
  projections = {},
}) {
  const normalizedRosterId = String(rosterId ?? '')
  const roster = rosters.find(
    (candidate) => String(candidate?.roster_id) === normalizedRosterId,
  )
  if (!roster) return null

  const owner = users.find(
    (candidate) => String(candidate?.user_id) === String(roster.owner_id),
  )
  const teamNames = buildRosterTeamNames(rosters, users)
  const starterIds = new Set(normalizePlayerIds(roster.starters))
  const reserveIds = new Set(normalizePlayerIds(roster.reserve))
  const taxiIds = new Set(normalizePlayerIds(roster.taxi))
  const playerIds = [...new Set([
    ...normalizePlayerIds(roster.players),
    ...starterIds,
    ...reserveIds,
    ...taxiIds,
  ])]

  const groups = {
    starters: [],
    bench: [],
    reserve: [],
    taxi: [],
  }

  playerIds.forEach((playerId) => {
    const player = players[playerId]
    const entry = {
      id: playerId,
      name: playerName(player, playerId),
      position: String(player?.position || 'FLEX').toUpperCase(),
      nflTeam: player?.team || 'FA',
      projectedPoints: Number.isFinite(Number(projections[playerId]))
        ? Number(projections[playerId])
        : 0,
    }

    if (reserveIds.has(playerId)) {
      groups.reserve.push(entry)
    } else if (taxiIds.has(playerId)) {
      groups.taxi.push(entry)
    } else if (starterIds.has(playerId)) {
      groups.starters.push(entry)
    } else {
      groups.bench.push(entry)
    }
  })

  Object.values(groups).forEach((group) => group.sort(sortPlayers))

  return {
    id: normalizedRosterId,
    teamName: teamNames[normalizedRosterId] || `Team ${normalizedRosterId}`,
    ownerName: ownerName(owner),
    playerCount: playerIds.length,
    ...groups,
  }
}
