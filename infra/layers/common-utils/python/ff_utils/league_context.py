"""Resolve the active Sleeper league from stable league identity."""

from __future__ import annotations

import os
from typing import Any, Callable, Mapping, TypedDict
from urllib.parse import quote


SLEEPER_API_BASE = "https://api.sleeper.app/v1"
HTTP_TIMEOUT_SECONDS = 10
MAX_LINEAGE_DEPTH = 20


class LeagueContextError(RuntimeError):
    """Base error for league-context failures."""


class LeagueConfigurationError(LeagueContextError):
    """Raised when required league identity configuration is missing."""


class SleeperStateError(LeagueContextError):
    """Raised when Sleeper's NFL state cannot be fetched or validated."""


class LeagueResolutionError(LeagueContextError):
    """Raised when a unique league cannot be resolved for the active season."""


class LeagueContext(TypedDict):
    """Public contract returned by ``GET /league-context``."""

    season: str
    week: int
    display_week: int
    season_type: str
    league_id: str
    league_name: str
    league_status: str
    previous_league_id: str | None
    total_rosters: int
    settings: dict[str, Any]


HttpGet = Callable[..., Any]


def _default_http_get(url: str, **kwargs: Any) -> Any:
    # Import lazily so the pure resolver can be tested without installed Lambda layers.
    import requests

    return requests.get(url, **kwargs)


def _fetch_json(url: str, http_get: HttpGet, error_type: type[LeagueContextError]) -> Any:
    try:
        response = http_get(url, timeout=HTTP_TIMEOUT_SECONDS)
        response.raise_for_status()
        return response.json()
    except Exception as error:
        raise error_type(f"Sleeper request failed for {url}: {error}") from error


def fetch_nfl_state(http_get: HttpGet = _default_http_get) -> dict[str, Any]:
    """Fetch and validate the season fields required by the application."""

    state = _fetch_json(
        f"{SLEEPER_API_BASE}/state/nfl",
        http_get,
        SleeperStateError,
    )
    if not isinstance(state, dict):
        raise SleeperStateError("Sleeper NFL state response must be an object")

    season = state.get("season")
    season_type = state.get("season_type")
    week = state.get("week")
    display_week = state.get("display_week")

    if not isinstance(season, (str, int)) or not str(season).strip():
        raise SleeperStateError("Sleeper NFL state is missing a valid season")
    if not isinstance(season_type, str) or not season_type:
        raise SleeperStateError("Sleeper NFL state is missing a valid season_type")
    if not isinstance(week, int) or isinstance(week, bool) or week < 1:
        raise SleeperStateError("Sleeper NFL state is missing a valid week")
    if not isinstance(display_week, int) or isinstance(display_week, bool) or display_week < 1:
        raise SleeperStateError("Sleeper NFL state is missing a valid display_week")

    return {
        **state,
        "season": str(season),
        "week": week,
        "display_week": display_week,
        "season_type": season_type,
    }


def _has_seed_ancestor(
    league: Mapping[str, Any],
    seed_league_id: str,
    http_get: HttpGet,
) -> bool:
    league_id = str(league.get("league_id", ""))
    if league_id == seed_league_id:
        return True

    previous_id = league.get("previous_league_id")
    visited = {league_id}

    for _ in range(MAX_LINEAGE_DEPTH):
        if not previous_id:
            return False

        previous_id = str(previous_id)
        if previous_id == seed_league_id:
            return True
        if previous_id in visited:
            raise LeagueResolutionError(
                f"Sleeper league lineage contains a cycle at league {previous_id}"
            )

        visited.add(previous_id)
        previous_league = _fetch_json(
            f"{SLEEPER_API_BASE}/league/{quote(previous_id, safe='')}",
            http_get,
            LeagueResolutionError,
        )
        if not isinstance(previous_league, dict):
            raise LeagueResolutionError(
                f"Sleeper returned invalid league data for ancestor {previous_id}"
            )
        previous_id = previous_league.get("previous_league_id")

    raise LeagueResolutionError(
        f"League lineage exceeded {MAX_LINEAGE_DEPTH} seasons without reaching "
        f"configured seed {seed_league_id}"
    )


def resolve_league(
    season: str,
    user_id: str,
    expected_name: str,
    seed_league_id: str,
    http_get: HttpGet = _default_http_get,
) -> dict[str, Any]:
    """Resolve exactly one league by member, name, season, and seed ancestry."""

    leagues = _fetch_json(
        f"{SLEEPER_API_BASE}/user/{quote(user_id, safe='')}/leagues/nfl/"
        f"{quote(season, safe='')}",
        http_get,
        LeagueResolutionError,
    )
    if not isinstance(leagues, list):
        raise LeagueResolutionError("Sleeper user leagues response must be a list")

    identity_matches = [
        league
        for league in leagues
        if isinstance(league, dict)
        and str(league.get("season", "")) == season
        and league.get("sport") == "nfl"
        and league.get("name") == expected_name
    ]

    if not identity_matches:
        raise LeagueResolutionError(
            f"No NFL league named {expected_name!r} was found for user {user_id} "
            f"in season {season}. Renew the league or update league identity configuration."
        )

    lineage_matches = [
        league
        for league in identity_matches
        if _has_seed_ancestor(league, seed_league_id, http_get)
    ]

    if not lineage_matches:
        candidate_ids = sorted(str(league.get("league_id", "<missing>")) for league in identity_matches)
        raise LeagueResolutionError(
            f"League candidates {candidate_ids} do not descend from configured seed "
            f"{seed_league_id}. Verify the seed and league renewal lineage."
        )
    if len(lineage_matches) > 1:
        candidate_ids = sorted(str(league.get("league_id", "<missing>")) for league in lineage_matches)
        raise LeagueResolutionError(
            f"Multiple leagues match {expected_name!r} for season {season}: "
            f"{candidate_ids}. Make the configured league identity unique."
        )

    league = lineage_matches[0]
    league_id = league.get("league_id")
    status = league.get("status")
    settings = league.get("settings")
    total_rosters = league.get("total_rosters")

    if not isinstance(league_id, (str, int)) or not str(league_id):
        raise LeagueResolutionError("Resolved Sleeper league is missing league_id")
    if not isinstance(status, str) or not status:
        raise LeagueResolutionError(f"Resolved Sleeper league {league_id} is missing status")
    if not isinstance(settings, dict):
        raise LeagueResolutionError(f"Resolved Sleeper league {league_id} is missing settings")
    if not isinstance(total_rosters, int) or isinstance(total_rosters, bool) or total_rosters < 1:
        raise LeagueResolutionError(
            f"Resolved Sleeper league {league_id} is missing total_rosters"
        )

    return league


def resolve_league_context(
    user_id: str,
    expected_name: str,
    seed_league_id: str,
    http_get: HttpGet = _default_http_get,
) -> LeagueContext:
    """Resolve the public league context from Sleeper's current NFL state."""

    state = fetch_nfl_state(http_get)
    season = state["season"]
    league = resolve_league(
        season=season,
        user_id=user_id,
        expected_name=expected_name,
        seed_league_id=seed_league_id,
        http_get=http_get,
    )

    previous_league_id = league.get("previous_league_id")
    return {
        "season": season,
        "week": state["week"],
        "display_week": state["display_week"],
        "season_type": state["season_type"],
        "league_id": str(league["league_id"]),
        "league_name": str(league["name"]),
        "league_status": str(league["status"]),
        "previous_league_id": (
            str(previous_league_id) if previous_league_id else None
        ),
        "total_rosters": league["total_rosters"],
        "settings": league["settings"],
    }


def resolve_league_context_from_env(
    http_get: HttpGet = _default_http_get,
) -> LeagueContext:
    """Resolve context using stable identity supplied by deployment configuration."""

    required = {
        "SLEEPER_LEAGUE_USER_ID": os.environ.get("SLEEPER_LEAGUE_USER_ID"),
        "SLEEPER_LEAGUE_NAME": os.environ.get("SLEEPER_LEAGUE_NAME"),
        "SLEEPER_LEAGUE_SEED_ID": os.environ.get("SLEEPER_LEAGUE_SEED_ID"),
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        raise LeagueConfigurationError(
            f"Missing required league context configuration: {', '.join(sorted(missing))}"
        )

    return resolve_league_context(
        user_id=required["SLEEPER_LEAGUE_USER_ID"],
        expected_name=required["SLEEPER_LEAGUE_NAME"],
        seed_league_id=required["SLEEPER_LEAGUE_SEED_ID"],
        http_get=http_get,
    )
