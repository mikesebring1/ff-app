export const TEAM_ROUTE_PARAM = 'team'
export const TEAM_ROUTE_HISTORY_KEY = 'madtownsTeamPage'

export function getTeamRouteRosterId(location) {
  const rosterId = new URLSearchParams(location?.search ?? '')
    .get(TEAM_ROUTE_PARAM)
    ?.trim()

  return rosterId || null
}

function updateTeamRoute(location, rosterId) {
  const params = new URLSearchParams(location?.search ?? '')

  if (rosterId == null) {
    params.delete(TEAM_ROUTE_PARAM)
  } else {
    params.set(TEAM_ROUTE_PARAM, String(rosterId))
  }

  const search = params.toString()
  return `${location?.pathname || '/'}${search ? `?${search}` : ''}${location?.hash ?? ''}`
}

export function buildTeamRouteUrl(location, rosterId) {
  return updateTeamRoute(location, rosterId)
}

export function buildStandingsRouteUrl(location) {
  return updateTeamRoute(location, null)
}
