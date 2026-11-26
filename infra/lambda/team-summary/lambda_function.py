"""Generate and cache team roster summaries through OpenRouter."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from typing import Any

import boto3
import requests

from ff_utils.dynamodb import DecimalEncoder, convert_floats_to_decimal, get_cors_headers
from ff_utils.league_context import resolve_league_context_from_env


logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb")
secrets_manager = boto3.client("secretsmanager")

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
SLEEPER_API_BASE = "https://api.sleeper.app/v1"
SUMMARY_DATA_TYPE = "team_summary"
SUMMARY_LOCK_DATA_TYPE = "team_summary_lock"
COOLDOWN_SECONDS = 24 * 60 * 60
GENERATION_LEASE_SECONDS = 90
PLAYER_CACHE_SCHEMA_VERSION = 2
TARGET_POSITIONS = ("QB", "RB", "WR", "TE", "DEF")
MAX_CANDIDATES_PER_POSITION = 5

_openrouter_api_key = None


class SummaryError(RuntimeError):
    """An expected team-summary failure safe to return to the client."""

    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


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
    origin = request_origin(event)
    method = event.get("httpMethod", "POST")

    if method == "OPTIONS":
        return response(204, {}, origin)
    if method != "POST":
        return response(405, {"error": "Method not allowed"}, origin)

    try:
        payload = parse_request_body(event.get("body"))
        result = generate_or_get_summary(
            payload["roster_id"],
            regenerate=payload["regenerate"],
        )
        return response(200, result, origin, {"Cache-Control": "no-store"})
    except SummaryError as error:
        logger.warning("Team summary request failed: %s", error)
        return response(error.status_code, {"error": str(error)}, origin)
    except Exception:
        logger.exception("Team summary request failed unexpectedly")
        return response(500, {"error": "Internal server error"}, origin)


def parse_request_body(raw_body):
    try:
        body = json.loads(raw_body or "{}")
    except (TypeError, json.JSONDecodeError) as error:
        raise SummaryError("Request body must be valid JSON", 400) from error

    if not isinstance(body, dict):
        raise SummaryError("Request body must be an object", 400)

    roster_id = body.get("roster_id")
    if not isinstance(roster_id, (str, int)) or not str(roster_id).strip():
        raise SummaryError("roster_id is required", 400)
    roster_id = str(roster_id).strip()
    if len(roster_id) > 64:
        raise SummaryError("roster_id is invalid", 400)

    regenerate = body.get("regenerate", False)
    if not isinstance(regenerate, bool):
        raise SummaryError("regenerate must be a boolean", 400)

    return {"roster_id": roster_id, "regenerate": regenerate}


def fetch_json(url, timeout=15):
    try:
        result = requests.get(url, timeout=timeout)
        result.raise_for_status()
        return result.json()
    except Exception as error:
        raise SummaryError(f"Failed to fetch roster context from Sleeper: {error}") from error


def player_name(player, player_id):
    first_name = str((player or {}).get("first_name") or "").strip()
    last_name = str((player or {}).get("last_name") or "").strip()
    return f"{first_name} {last_name}".strip() or f"Player {player_id}"


def user_team_name(user, roster_id):
    metadata = user.get("metadata") if isinstance(user, dict) else {}
    return (
        str((metadata or {}).get("team_name") or "").strip()
        or str((user or {}).get("display_name") or "").strip()
        or str((user or {}).get("username") or "").strip()
        or f"Team {roster_id}"
    )


def normalize_player_ids(values):
    return [
        str(value)
        for value in (values or [])
        if value is not None and str(value) and str(value) != "0"
    ]


def projection_points(projections, player_id):
    projection = projections.get(player_id)
    if isinstance(projection, dict):
        projection = projection.get("pts_ppr", 0)
    try:
        return round(float(projection or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def load_player_map(table, league_context):
    item = table.get_item(
        Key={"data_type": "players", "id": "nfl_players"}
    ).get("Item")
    players = item.get("data") if isinstance(item, dict) else None
    if (
        not isinstance(players, dict)
        or item.get("schema_version") != PLAYER_CACHE_SCHEMA_VERSION
        or item.get("season") != league_context["season"]
        or item.get("league_id") != league_context["league_id"]
    ):
        raise SummaryError("Player metadata is not available for team analysis", 503)
    return players


def load_overall_team(table, league_context, roster_id):
    result = table.get_item(
        Key={"season": league_context["season"], "team_id": roster_id}
    )
    item = result.get("Item")
    if not isinstance(item, dict) or item.get("league_id") != league_context["league_id"]:
        return None
    return item


def build_team_context(league_context, roster_id, league_data_table, overall_table):
    league_id = league_context["league_id"]
    season = league_context["season"]
    season_type = league_context["season_type"]
    week = league_context["display_week"]
    rosters, users, projections = (
        fetch_json(f"{SLEEPER_API_BASE}/league/{league_id}/rosters"),
        fetch_json(f"{SLEEPER_API_BASE}/league/{league_id}/users"),
        fetch_json(
            f"{SLEEPER_API_BASE}/projections/nfl/{season_type}/{season}/{week}",
            timeout=20,
        ),
    )
    if not isinstance(rosters, list) or not isinstance(users, list):
        raise SummaryError("Sleeper returned invalid league roster data")
    if not isinstance(projections, dict):
        projections = {}

    roster = next(
        (item for item in rosters if str(item.get("roster_id")) == roster_id),
        None,
    )
    if not roster:
        raise SummaryError("Team is not part of the active league", 404)

    owner = next(
        (user for user in users if str(user.get("user_id")) == str(roster.get("owner_id"))),
        {},
    )
    players = load_player_map(league_data_table, league_context)
    starter_ids = set(normalize_player_ids(roster.get("starters")))
    reserve_ids = set(normalize_player_ids(roster.get("reserve")))
    taxi_ids = set(normalize_player_ids(roster.get("taxi")))
    roster_player_ids = list(dict.fromkeys(
        normalize_player_ids(roster.get("players"))
        + list(starter_ids)
        + list(reserve_ids)
        + list(taxi_ids)
    ))

    team_players = []
    for player_id in roster_player_ids:
        player = players.get(player_id, {})
        if player_id in reserve_ids:
            roster_status = "injured_reserve"
        elif player_id in taxi_ids:
            roster_status = "taxi"
        elif player_id in starter_ids:
            roster_status = "starter"
        else:
            roster_status = "bench"
        team_players.append({
            "player_id": player_id,
            "name": player_name(player, player_id),
            "position": str(player.get("position") or "FLEX").upper(),
            "nfl_team": player.get("team") or "FA",
            "roster_status": roster_status,
            "projected_points": projection_points(projections, player_id),
        })

    rostered_ids = {
        player_id
        for league_roster in rosters
        for player_id in normalize_player_ids(league_roster.get("players"))
    }
    candidates_by_position = {position: [] for position in TARGET_POSITIONS}
    for player_id, player in players.items():
        if player_id in rostered_ids or not isinstance(player, dict):
            continue
        position = str(player.get("position") or "").upper()
        if position not in candidates_by_position:
            continue
        points = projection_points(projections, player_id)
        if points <= 0:
            continue
        candidates_by_position[position].append({
            "player_id": player_id,
            "name": player_name(player, player_id),
            "position": position,
            "nfl_team": player.get("team") or "FA",
            "projected_points": points,
        })

    available_players = []
    for position in TARGET_POSITIONS:
        candidates = sorted(
            candidates_by_position[position],
            key=lambda player: (-player["projected_points"], player["name"]),
        )[:MAX_CANDIDATES_PER_POSITION]
        available_players.extend(candidates)

    overall = load_overall_team(overall_table, league_context, roster_id)
    standings = None
    if overall:
        standings = {
            "wins": float(overall.get("total_wins", 0)),
            "losses": float(overall.get("total_losses", 0)),
            "total_points": float(overall.get("total_points", 0)),
            "playoff_percentage": float(overall.get("playoff_percentage", 0)),
        }

    return {
        "league": {
            "name": league_context["league_name"],
            "season": season,
            "week": week,
            "scoring": "PPR, evaluated in the league's vs-everyone format",
        },
        "team": {
            "roster_id": roster_id,
            "name": user_team_name(owner, roster_id),
            "owner": owner.get("display_name") or owner.get("username"),
            "standings": standings,
            "players": team_players,
        },
        "available_players": available_players,
    }


def context_hash(team_context):
    encoded = json.dumps(team_context, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def get_openrouter_api_key():
    global _openrouter_api_key
    if _openrouter_api_key:
        return _openrouter_api_key

    secret_id = os.environ.get("OPENROUTER_SECRET_ID")
    if not secret_id:
        raise SummaryError("Team summaries are not configured", 503)
    try:
        secret_value = secrets_manager.get_secret_value(SecretId=secret_id).get("SecretString")
        parsed = json.loads(secret_value)
        if isinstance(parsed, dict):
            secret_value = parsed.get("apiKey") or parsed.get("OPENROUTER_API_KEY")
    except (TypeError, json.JSONDecodeError):
        pass
    except Exception as error:
        raise SummaryError("Team summaries are not configured", 503) from error

    if not isinstance(secret_value, str) or not secret_value.strip():
        raise SummaryError("Team summaries are not configured", 503)
    _openrouter_api_key = secret_value.strip()
    return _openrouter_api_key


def parse_model_json(content):
    if not isinstance(content, str):
        raise SummaryError("OpenRouter returned an invalid summary")
    content = content.strip()
    if content.startswith("```"):
        content = content.removeprefix("```json").removeprefix("```")
        content = content.removesuffix("```").strip()
    try:
        return json.loads(content)
    except json.JSONDecodeError as error:
        raise SummaryError("OpenRouter returned an invalid summary") from error


def clean_string_list(value, limit=5):
    if not isinstance(value, list):
        return []
    return [str(item).strip()[:300] for item in value if str(item).strip()][:limit]


def validate_summary(value, available_players):
    if not isinstance(value, dict):
        raise SummaryError("OpenRouter returned an invalid summary")
    identity = str(value.get("identity") or "").strip()[:600]
    strengths = clean_string_list(value.get("strengths"))
    gaps = clean_string_list(value.get("gaps"))
    strategy = clean_string_list(value.get("strategy"), limit=4)
    if not identity or not strengths or not gaps:
        raise SummaryError("OpenRouter returned an incomplete summary")

    available_by_id = {
        player["player_id"]: player for player in available_players
    }
    targets = []
    for target in value.get("targets") or []:
        if not isinstance(target, dict):
            continue
        player = available_by_id.get(str(target.get("player_id") or ""))
        reason = str(target.get("reason") or "").strip()[:300]
        if not player or not reason:
            continue
        targets.append({**player, "reason": reason})
        if len(targets) == 5:
            break

    return {
        "identity": identity,
        "strengths": strengths,
        "gaps": gaps,
        "targets": targets,
        "strategy": strategy,
    }


def call_openrouter(team_context):
    model = os.environ.get("OPENROUTER_MODEL", "google/gemini-2.5-flash")
    prompt = (
        "Analyze this fantasy football team using only the supplied JSON. "
        "Describe its identity, concrete strengths, gaps, and practical improvement strategy. "
        "Potential targets must come only from available_players and must use their exact "
        "player_id. Account for starters, bench depth, projected points, and standings. "
        "Do not claim injuries, roles, schedules, or news not present in the context. Return "
        "JSON with: identity (string), strengths (string array), gaps (string array), "
        "targets (array of {player_id, reason}), and strategy (string array).\n\n"
        f"TEAM_CONTEXT={json.dumps(team_context, separators=(',', ':'))}"
    )
    try:
        result = requests.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {get_openrouter_api_key()}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://madtownsfinest.app",
                "X-Title": "Madtown's Finest Team Summary",
            },
            json={
                "model": model,
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a concise fantasy football roster analyst.",
                    },
                    {"role": "user", "content": prompt},
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.3,
                "max_tokens": 1200,
            },
            timeout=60,
        )
        result.raise_for_status()
        payload = result.json()
        content = payload["choices"][0]["message"]["content"]
    except Exception as error:
        logger.error("OpenRouter request failed: %s", error)
        raise SummaryError("The team analysis service is temporarily unavailable") from error

    return validate_summary(
        parse_model_json(content),
        team_context["available_players"],
    ), model


def acquire_generation_lease(table, cache_id, now):
    try:
        table.put_item(
            Item={
                "data_type": SUMMARY_LOCK_DATA_TYPE,
                "id": cache_id,
                "lease_until": now + GENERATION_LEASE_SECONDS,
            },
            ConditionExpression=(
                "attribute_not_exists(lease_until) OR lease_until < :now"
            ),
            ExpressionAttributeValues={":now": now},
        )
    except Exception as error:
        if getattr(error, "response", {}).get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            raise SummaryError("A summary is already being generated", 409) from error
        raise


def response_from_item(item, now, cached, cooldown_active=False):
    generated_at = int(item["generated_at"])
    return {
        "summary": item["summary"],
        "generated_at": generated_at,
        "regenerate_after": generated_at + COOLDOWN_SECONDS,
        "model": item.get("model"),
        "cached": cached,
        "cooldown_active": cooldown_active,
        "server_time": now,
    }


def generate_or_get_summary(roster_id, regenerate=False, now=None):
    now = int(time.time()) if now is None else int(now)
    league_context = resolve_league_context_from_env()
    league_data_table = dynamodb.Table(os.environ["LEAGUE_DATA_TABLE"])
    overall_table = dynamodb.Table(os.environ["OVERALL_STANDINGS_TABLE"])
    cache_id = f"{league_context['season']}:{league_context['league_id']}:{roster_id}"
    cached_item = league_data_table.get_item(
        Key={"data_type": SUMMARY_DATA_TYPE, "id": cache_id}
    ).get("Item")

    team_context = build_team_context(
        league_context,
        roster_id,
        league_data_table,
        overall_table,
    )
    current_hash = context_hash(team_context)
    cache_matches = (
        isinstance(cached_item, dict)
        and cached_item.get("context_hash") == current_hash
        and isinstance(cached_item.get("summary"), dict)
    )
    if cache_matches and not regenerate:
        return response_from_item(cached_item, now, cached=True)

    if cache_matches and regenerate:
        generated_at = int(cached_item.get("generated_at", 0))
        if now < generated_at + COOLDOWN_SECONDS:
            return response_from_item(
                cached_item,
                now,
                cached=True,
                cooldown_active=True,
            )

    acquire_generation_lease(league_data_table, cache_id, now)
    summary, model = call_openrouter(team_context)
    item = {
        "data_type": SUMMARY_DATA_TYPE,
        "id": cache_id,
        "season": league_context["season"],
        "league_id": league_context["league_id"],
        "roster_id": roster_id,
        "context_hash": current_hash,
        "generated_at": now,
        "model": model,
        "summary": summary,
    }
    league_data_table.put_item(Item=convert_floats_to_decimal(item))
    return response_from_item(item, now, cached=False)
