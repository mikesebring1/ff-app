"""Generate one permanent AI recap for each finalized fantasy week."""

from __future__ import annotations

import json
import logging
import os
import time
from functools import lru_cache

import boto3
import requests

from ff_utils.dynamodb import DecimalEncoder, convert_floats_to_decimal, get_cors_headers
from ff_utils.league_context import resolve_league_context_from_env


logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb")
secrets_manager = boto3.client("secretsmanager")

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
REVIEW_DATA_TYPE = "weekly_review"
REVIEW_LOCK_DATA_TYPE = "weekly_review_lock"
MATCHUP_DATA_TYPE = "matchups"
PLAYER_CACHE_SCHEMA_VERSION = 2
GENERATION_LEASE_SECONDS = 120
LINEUP_SLOTS = ("QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "DST")

_openrouter_api_key = None


class ReviewError(RuntimeError):
    """An expected weekly-review failure safe to return to the client."""

    def __init__(self, message, status_code=502):
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
        week = parse_request_body(event.get("body"))
        result = generate_or_get_review(week)
        return response(200, result, origin, {"Cache-Control": "no-store"})
    except ReviewError as error:
        logger.warning("Weekly review request failed: %s", error)
        return response(error.status_code, {"error": str(error)}, origin)
    except Exception:
        logger.exception("Weekly review request failed unexpectedly")
        return response(500, {"error": "Internal server error"}, origin)


def parse_request_body(raw_body):
    try:
        body = json.loads(raw_body or "{}")
    except (TypeError, json.JSONDecodeError) as error:
        raise ReviewError("Request body must be valid JSON", 400) from error
    if not isinstance(body, dict):
        raise ReviewError("Request body must be an object", 400)

    week = body.get("week")
    if isinstance(week, bool):
        raise ReviewError("week must be an integer from 1 through 18", 400)
    try:
        week = int(week)
    except (TypeError, ValueError) as error:
        raise ReviewError("week must be an integer from 1 through 18", 400) from error
    if week < 1 or week > 18:
        raise ReviewError("week must be an integer from 1 through 18", 400)
    return week


def float_value(value):
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def clean_number(value):
    number = round(float_value(value), 2)
    return int(number) if number.is_integer() else number


def player_name(player, player_id):
    first_name = str((player or {}).get("first_name") or "").strip()
    last_name = str((player or {}).get("last_name") or "").strip()
    return f"{first_name} {last_name}".strip() or f"Player {player_id}"


def normalized_position(player):
    position = str((player or {}).get("position") or "").upper()
    return "DST" if position == "DEF" else position


def slot_accepts(slot, position):
    if slot == "FLEX":
        return position in {"RB", "WR", "TE"}
    return slot == position


def lineup_slots(starter_count):
    if starter_count <= len(LINEUP_SLOTS):
        return LINEUP_SLOTS[:starter_count]
    return LINEUP_SLOTS + ("FLEX",) * (starter_count - len(LINEUP_SLOTS))


def optimize_lineup(players, slots, actual_starters):
    if not players or not slots:
        return 0.0, []

    actual_slot_by_player = {
        player_id: slots[index]
        for index, player_id in enumerate(actual_starters)
        if index < len(slots)
    }
    candidates_by_slot = []
    for slot in slots:
        candidates = []
        for index, player in enumerate(players):
            if slot_accepts(slot, player["position"]) or actual_slot_by_player.get(
                player["player_id"]
            ) == slot:
                candidates.append(index)
        candidates_by_slot.append(tuple(candidates))

    @lru_cache(maxsize=None)
    def best(slot_index, used_mask):
        if slot_index == len(slots):
            return 0.0, ()

        best_result = None
        for player_index in candidates_by_slot[slot_index]:
            bit = 1 << player_index
            if used_mask & bit:
                continue
            remaining = best(slot_index + 1, used_mask | bit)
            if remaining is None:
                continue
            score = players[player_index]["points"] + remaining[0]
            result = (score, (player_index,) + remaining[1])
            if best_result is None or result[0] > best_result[0]:
                best_result = result
        return best_result

    result = best(0, 0)
    if result is None:
        return 0.0, []
    return result[0], [players[index] for index in result[1]]


def build_lineup_analysis(matchup, players):
    starter_ids = [str(player_id) for player_id in matchup.get("starters") or []]
    player_ids = [str(player_id) for player_id in matchup.get("players") or []]
    player_ids = list(dict.fromkeys(player_ids + starter_ids))
    starter_set = set(starter_ids)
    points_by_player = matchup.get("players_points") or {}
    slots = lineup_slots(len(starter_ids))

    lineup_players = []
    for player_id in player_ids:
        metadata = players.get(player_id, {})
        lineup_players.append({
            "player_id": player_id,
            "name": player_name(metadata, player_id),
            "position": normalized_position(metadata),
            "points": round(float_value(points_by_player.get(player_id)), 2),
        })

    by_id = {player["player_id"]: player for player in lineup_players}
    starters = []
    for index, player_id in enumerate(starter_ids):
        player = by_id.get(player_id)
        if player:
            starters.append({**player, "slot": slots[index]})
    sitters = sorted(
        (player for player in lineup_players if player["player_id"] not in starter_set),
        key=lambda player: (-player["points"], player["name"]),
    )

    optimal_points, optimal_players = optimize_lineup(lineup_players, slots, starter_ids)
    actual_points = sum(player["points"] for player in starters)
    missed_swaps = []
    for index, optimal_player in enumerate(optimal_players):
        if index >= len(starters):
            continue
        actual_player = starters[index]
        gain = round(optimal_player["points"] - actual_player["points"], 2)
        if (
            optimal_player["player_id"] not in starter_set
            and optimal_player["player_id"] != actual_player["player_id"]
            and gain > 0
        ):
            missed_swaps.append({
                "slot": slots[index],
                "started": actual_player["name"],
                "sat": optimal_player["name"],
                "points_gained": gain,
            })
    missed_swaps.sort(key=lambda swap: -swap["points_gained"])

    points_left = max(0, round(optimal_points - actual_points, 2))
    efficiency = 100.0 if points_left == 0 else (
        round(actual_points / optimal_points * 100, 1) if optimal_points > 0 else 0.0
    )
    return {
        "starter_points": round(actual_points, 2),
        "optimal_points": round(optimal_points, 2),
        "points_left_on_bench": points_left,
        "lineup_efficiency": efficiency,
        "starters": starters,
        "sitters": sitters,
        "missed_swaps": missed_swaps[:3],
    }


def load_finalized_data(league_data_table, weekly_table, league_context, week):
    league_id = league_context["league_id"]
    season = league_context["season"]
    finalization_id = f"{league_id}:{season}:{week}"
    matchup_item = league_data_table.get_item(
        Key={"data_type": MATCHUP_DATA_TYPE, "id": finalization_id}
    ).get("Item")
    if (
        not isinstance(matchup_item, dict)
        or matchup_item.get("league_id") != league_id
        or matchup_item.get("season") != season
        or int(matchup_item.get("week", 0)) != week
        or not isinstance(matchup_item.get("data"), list)
    ):
        raise ReviewError("The weekly review is available after this week is finalized", 409)

    standings = weekly_table.query(
        KeyConditionExpression="season_week = :season_week",
        ExpressionAttributeValues={":season_week": f"{season}_{week}"},
    ).get("Items", [])
    standings = [
        item for item in standings
        if item.get("league_id") == league_id
    ]
    if len(standings) != len(matchup_item["data"]):
        raise ReviewError("Finalized standings are incomplete for this week", 503)

    player_item = league_data_table.get_item(
        Key={"data_type": "players", "id": "nfl_players"}
    ).get("Item")
    players = player_item.get("data") if isinstance(player_item, dict) else None
    if (
        not isinstance(players, dict)
        or player_item.get("schema_version") != PLAYER_CACHE_SCHEMA_VERSION
        or player_item.get("season") != season
        or player_item.get("league_id") != league_id
    ):
        raise ReviewError("Player metadata is not available for this review", 503)

    return matchup_item["data"], standings, players


def build_week_context(league_context, week, matchups, standings, players):
    matchup_by_roster = {
        str(matchup.get("roster_id")): matchup for matchup in matchups
    }
    sorted_standings = sorted(
        standings,
        key=lambda item: (float_value(item.get("rank", 999)), -float_value(item.get("points"))),
    )
    teams = []
    for standing in sorted_standings:
        roster_id = str(standing.get("team_id"))
        matchup = matchup_by_roster.get(roster_id)
        if not matchup:
            raise ReviewError("Finalized matchup data is incomplete for this week", 503)
        wins = clean_number(standing.get("wins"))
        losses = clean_number(standing.get("losses"))
        teams.append({
            "roster_id": roster_id,
            "team_name": str(standing.get("team_name") or f"Team {roster_id}"),
            "rank": clean_number(standing.get("rank")),
            "points": round(float_value(standing.get("points")), 2),
            "record": f"{wins}-{losses}",
            "lineup": build_lineup_analysis(matchup, players),
        })

    points = [team["points"] for team in teams]
    return {
        "league": {
            "name": league_context["league_name"],
            "season": league_context["season"],
            "week": week,
            "scoring": "PPR with weekly vs-everyone records",
            "average_points": round(sum(points) / len(points), 2) if points else 0,
        },
        "teams": teams,
    }


def get_openrouter_api_key():
    global _openrouter_api_key
    if _openrouter_api_key:
        return _openrouter_api_key

    secret_id = os.environ.get("OPENROUTER_SECRET_ID")
    if not secret_id:
        raise ReviewError("Weekly reviews are not configured", 503)
    try:
        secret_value = secrets_manager.get_secret_value(SecretId=secret_id).get("SecretString")
        parsed = json.loads(secret_value)
        if isinstance(parsed, dict):
            secret_value = parsed.get("apiKey") or parsed.get("OPENROUTER_API_KEY")
    except (TypeError, json.JSONDecodeError):
        pass
    except Exception as error:
        raise ReviewError("Weekly reviews are not configured", 503) from error

    if not isinstance(secret_value, str) or not secret_value.strip():
        raise ReviewError("Weekly reviews are not configured", 503)
    _openrouter_api_key = secret_value.strip()
    return _openrouter_api_key


def parse_model_json(content):
    if not isinstance(content, str):
        raise ReviewError("OpenRouter returned an invalid weekly review")
    content = content.strip()
    if content.startswith("```"):
        content = content.removeprefix("```json").removeprefix("```")
        content = content.removesuffix("```").strip()
    try:
        return json.loads(content)
    except json.JSONDecodeError as error:
        raise ReviewError("OpenRouter returned an invalid weekly review") from error


def clean_text(value, field, limit):
    text = str(value or "").strip()
    if not text:
        raise ReviewError(f"OpenRouter review is missing {field}")
    return text[:limit]


def validate_review(value, week_context):
    if not isinstance(value, dict):
        raise ReviewError("OpenRouter returned an invalid weekly review")
    expected = {team["roster_id"]: team for team in week_context["teams"]}
    generated = {}
    for recap in value.get("teams") or []:
        if not isinstance(recap, dict):
            continue
        roster_id = str(recap.get("roster_id") or "")
        if roster_id not in expected or roster_id in generated:
            continue
        generated[roster_id] = {
            "performance": clean_text(recap.get("performance"), "team performance", 700),
            "lineup": clean_text(recap.get("lineup"), "lineup analysis", 700),
            "verdict": clean_text(recap.get("verdict"), "team verdict", 180),
        }
    if set(generated) != set(expected):
        raise ReviewError("OpenRouter review did not cover every team")

    teams = []
    for team in week_context["teams"]:
        teams.append({
            "roster_id": team["roster_id"],
            "team_name": team["team_name"],
            "rank": team["rank"],
            "points": team["points"],
            "record": team["record"],
            "points_left_on_bench": team["lineup"]["points_left_on_bench"],
            "lineup_efficiency": team["lineup"]["lineup_efficiency"],
            **generated[team["roster_id"]],
        })
    return {
        "headline": clean_text(value.get("headline"), "headline", 160),
        "overview": clean_text(value.get("overview"), "overview", 900),
        "teams": teams,
    }


def call_openrouter(week_context):
    model = os.environ.get("OPENROUTER_MODEL", "google/gemini-2.5-flash")
    prompt = (
        "Write an objective weekly fantasy-football review using only the supplied JSON. "
        "Cover every team exactly once. For each team, explain its performance and assess "
        "the actual starters versus sitters, praising good calls and bluntly identifying "
        "costly misses only when the data supports them. The tone is a sharp sports columnist: "
        "helpful, concise, blunt, and dryly funny, with a few earned digs across the whole recap. "
        "Do not be silly, fabricate news or injuries, use vulgarity or slurs, attack an owner "
        "personally, or force a joke into every team. A rank is this league's weekly vs-everyone "
        "finish. points_left_on_bench is calculated from an eligible optimal lineup. Return JSON "
        "with headline (string), overview (string), and teams (array containing every exact "
        "roster_id plus performance, lineup, and verdict strings).\n\n"
        f"WEEK_CONTEXT={json.dumps(week_context, separators=(',', ':'))}"
    )
    try:
        result = requests.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {get_openrouter_api_key()}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://madtownsfinest.app",
                "X-Title": "Madtown's Finest Weekly Review",
            },
            json={
                "model": model,
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a rigorous fantasy football columnist with a dry edge.",
                    },
                    {"role": "user", "content": prompt},
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.55,
                "max_tokens": 5000,
            },
            timeout=90,
        )
        result.raise_for_status()
        payload = result.json()
        content = payload["choices"][0]["message"]["content"]
    except Exception as error:
        logger.error("OpenRouter weekly review request failed: %s", error)
        raise ReviewError("The weekly review service is temporarily unavailable") from error

    return validate_review(parse_model_json(content), week_context), model


def acquire_generation_lease(table, cache_id, now):
    try:
        table.put_item(
            Item={
                "data_type": REVIEW_LOCK_DATA_TYPE,
                "id": cache_id,
                "lease_until": now + GENERATION_LEASE_SECONDS,
            },
            ConditionExpression="attribute_not_exists(lease_until) OR lease_until < :now",
            ExpressionAttributeValues={":now": now},
        )
    except Exception as error:
        if getattr(error, "response", {}).get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            raise ReviewError("The weekly review is already being generated", 409) from error
        raise


def review_response(item, cached):
    return {
        "week": int(item["week"]),
        "review": item["review"],
        "generated_at": int(item["generated_at"]),
        "model": item.get("model"),
        "cached": cached,
    }


def generate_or_get_review(week, now=None):
    now = int(time.time()) if now is None else int(now)
    league_context = resolve_league_context_from_env()
    league_data_table = dynamodb.Table(os.environ["LEAGUE_DATA_TABLE"])
    weekly_table = dynamodb.Table(os.environ["WEEKLY_STANDINGS_TABLE"])
    cache_id = f"{league_context['season']}:{league_context['league_id']}:{week}"
    cached_item = league_data_table.get_item(
        Key={"data_type": REVIEW_DATA_TYPE, "id": cache_id}
    ).get("Item")
    if isinstance(cached_item, dict) and isinstance(cached_item.get("review"), dict):
        return review_response(cached_item, cached=True)

    matchups, standings, players = load_finalized_data(
        league_data_table,
        weekly_table,
        league_context,
        week,
    )
    week_context = build_week_context(
        league_context,
        week,
        matchups,
        standings,
        players,
    )
    acquire_generation_lease(league_data_table, cache_id, now)
    review, model = call_openrouter(week_context)
    item = {
        "data_type": REVIEW_DATA_TYPE,
        "id": cache_id,
        "season": league_context["season"],
        "league_id": league_context["league_id"],
        "week": week,
        "generated_at": now,
        "model": model,
        "review": review,
    }
    league_data_table.put_item(Item=convert_floats_to_decimal(item))
    return review_response(item, cached=False)
