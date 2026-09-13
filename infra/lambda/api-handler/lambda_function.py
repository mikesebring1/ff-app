"""Read-only API for persisted standings and active Sleeper context."""

import json
import logging
import os

import boto3

from ff_utils.dynamodb import DecimalEncoder, get_cors_headers
from ff_utils.league_context import LeagueContextError, resolve_league_context_from_env


logger = logging.getLogger()
logger.setLevel(logging.INFO)
dynamodb = boto3.resource("dynamodb")
PLAYER_CACHE_SCHEMA_VERSION = 2


def request_origin(event):
    for name, value in (event.get("headers") or {}).items():
        if name.lower() == "origin":
            return value
    return None


def response(status_code, body, origin=None, extra_headers=None):
    headers = get_cors_headers(origin)
    headers.update(extra_headers or {})
    return {
        "statusCode": status_code,
        "headers": headers,
        "body": json.dumps(body, cls=DecimalEncoder),
    }


def lambda_handler(event, context):
    path = event.get("path", "")
    method = event.get("httpMethod", "GET")
    query_params = event.get("queryStringParameters") or {}
    origin = request_origin(event)

    try:
        if method == "OPTIONS":
            return response(204, {}, origin)
        if path.endswith("/weekly") and method == "GET":
            table = dynamodb.Table(os.environ["WEEKLY_STANDINGS_TABLE"])
            return handle_weekly_standings(table, query_params, origin)
        if path.endswith("/overall") and method == "GET":
            table = dynamodb.Table(os.environ["OVERALL_STANDINGS_TABLE"])
            return handle_overall_standings(table, query_params, origin)
        if path.endswith("/league-context") and method == "GET":
            return handle_league_context(origin)
        if path.endswith("/players") and method == "GET":
            table = dynamodb.Table(os.environ["LEAGUE_DATA_TABLE"])
            return handle_players(table, query_params, origin)
        return response(404, {"error": "Not found"}, origin)
    except Exception:
        logger.exception("Read API failed")
        return response(500, {"error": "Internal server error"}, origin)


def handle_weekly_standings(table, query_params, origin=None):
    missing = [name for name in ("week", "season", "league_id") if not query_params.get(name)]
    if missing:
        return invalid_query_response(missing, origin)

    week = query_params["week"]
    season = query_params["season"]
    league_id = query_params["league_id"]
    try:
        week_number = int(week)
        if week_number < 1:
            raise ValueError
    except (TypeError, ValueError):
        return response(400, {"error": "week must be a positive integer"}, origin)

    result = table.query(
        KeyConditionExpression=boto3.dynamodb.conditions.Key("season_week").eq(
            f"{season}_{week_number}"
        ),
        FilterExpression=boto3.dynamodb.conditions.Attr("league_id").eq(league_id),
        ScanIndexForward=True,
    )
    standings = sorted(result.get("Items", []), key=lambda item: item.get("rank", 999))
    return response(200, {
        "week": week_number,
        "season": season,
        "league_id": league_id,
        "standings": standings,
    }, origin)


def handle_overall_standings(table, query_params, origin=None):
    missing = [name for name in ("season", "league_id") if not query_params.get(name)]
    if missing:
        return invalid_query_response(missing, origin)

    season = query_params["season"]
    league_id = query_params["league_id"]
    result = table.query(
        KeyConditionExpression=boto3.dynamodb.conditions.Key("season").eq(season),
        FilterExpression=boto3.dynamodb.conditions.Attr("league_id").eq(league_id),
    )
    standings = sorted(
        result.get("Items", []),
        key=lambda item: (
            float(item.get("win_percentage", 0)),
            float(item.get("total_points", 0)),
        ),
        reverse=True,
    )
    for rank, team in enumerate(standings, 1):
        team["current_rank"] = rank
    return response(200, {
        "season": season,
        "league_id": league_id,
        "standings": standings,
    }, origin)


def invalid_query_response(missing, origin=None):
    return response(400, {
        "error": f"Missing required query parameters: {', '.join(missing)}"
    }, origin)


def handle_players(table, query_params, origin=None):
    """Return the backend-owned compact player map for one league season."""
    missing = [name for name in ("season", "league_id") if not query_params.get(name)]
    if missing:
        return invalid_query_response(missing, origin)

    season = query_params["season"]
    league_id = query_params["league_id"]
    result = table.get_item(Key={"data_type": "players", "id": "nfl_players"})
    item = result.get("Item")
    if (
        not isinstance(item, dict)
        or item.get("season") != season
        or item.get("league_id") != league_id
    ):
        return response(404, {
            "error": "Player metadata is not available for this league season"
        }, origin)

    players = item.get("data")
    if (
        item.get("schema_version") != PLAYER_CACHE_SCHEMA_VERSION
        or not isinstance(players, dict)
        or item.get("player_count") != len(players)
    ):
        return response(503, {
            "error": "Player metadata is being refreshed"
        }, origin)

    return response(200, {
        "season": season,
        "league_id": league_id,
        "schema_version": item.get("schema_version"),
        "refreshed_at": item.get("refreshed_at"),
        "player_count": item.get("player_count", len(players)),
        "players": players,
    }, origin, {"Cache-Control": "public, max-age=86400"})


def handle_league_context(origin=None):
    try:
        return response(200, resolve_league_context_from_env(), origin)
    except LeagueContextError as error:
        logger.error("Failed to resolve league context: %s", error)
        return response(502, {
            "error": "Failed to resolve active league context",
            "details": str(error),
        }, origin)
