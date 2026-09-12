"""Finalize completed Sleeper weeks on a schedule.

The handler is also safe to invoke directly with ``{"force_week": 7}`` for
IAM-controlled recovery after a stat correction. No HTTP route invokes it.
"""

import hashlib
import json
import logging
import os
import time
import uuid

import boto3
import requests
from botocore.exceptions import ClientError

from ff_standings import StandingsService
from ff_utils.dynamodb import convert_floats_to_decimal
from ff_utils.league_context import resolve_league_context_from_env


logger = logging.getLogger()
logger.setLevel(logging.INFO)

FINALIZATION_DATA_TYPE = "week_finalization"
LEASE_SECONDS = 20 * 60
DEFAULT_PLAYOFF_WEEK_START = 16


def completed_regular_season_weeks(league_context):
    """Return regular-season weeks Sleeper has advanced beyond."""
    current_week = league_context.get("week")
    if not isinstance(current_week, int) or isinstance(current_week, bool) or current_week < 1:
        raise ValueError("League context does not contain a valid current week")

    settings = league_context.get("settings") or {}
    playoff_week_start = settings.get("playoff_week_start", DEFAULT_PLAYOFF_WEEK_START)
    if not isinstance(playoff_week_start, int) or playoff_week_start < 2:
        playoff_week_start = DEFAULT_PLAYOFF_WEEK_START
    last_regular_week = playoff_week_start - 1

    season_type = str(league_context.get("season_type") or "").lower()
    league_status = str(league_context.get("league_status") or "").lower()
    if season_type in {"pre", "preseason"}:
        return []
    if season_type in {"post", "postseason"} or league_status == "complete":
        completed_through = last_regular_week
    elif season_type == "regular":
        completed_through = min(current_week - 1, last_regular_week)
    else:
        completed_through = min(current_week - 1, last_regular_week)

    return list(range(1, max(0, completed_through) + 1))


def requested_force_weeks(event, completed_weeks):
    """Validate the optional direct-invocation recovery payload."""
    event = event or {}
    requested = event.get("force_weeks")
    if requested is None and "force_week" in event:
        requested = [event["force_week"]]
    if requested is None:
        return set()
    if not isinstance(requested, list):
        raise ValueError("force_weeks must be a list of completed week numbers")

    force_weeks = set()
    for week in requested:
        if not isinstance(week, int) or isinstance(week, bool) or week not in completed_weeks:
            raise ValueError(f"Cannot force week {week!r}; it is not a completed regular-season week")
        force_weeks.add(week)
    return force_weeks


def finalization_id(league_id, season, week):
    return f"{league_id}:{season}:{week}"


def acquire_week(table, league_id, season, week, attempt_id, force=False, now=None):
    """Acquire a retryable lease, returning False when another run owns the week."""
    now = int(time.time()) if now is None else int(now)
    try:
        table.update_item(
            Key={
                "data_type": FINALIZATION_DATA_TYPE,
                "id": finalization_id(league_id, season, week),
            },
            UpdateExpression=(
                "SET #status = :processing, attempt_id = :attempt_id, "
                "league_id = :league_id, season = :season, week = :week, "
                "started_at = :now, lease_expires_at = :lease_expires_at"
            ),
            ConditionExpression=(
                "attribute_not_exists(#status) OR #status = :failed OR "
                "lease_expires_at < :now OR (#status = :completed AND :force = :true)"
            ),
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={
                ":processing": "processing",
                ":failed": "failed",
                ":completed": "completed",
                ":attempt_id": attempt_id,
                ":league_id": league_id,
                ":season": season,
                ":week": week,
                ":now": now,
                ":lease_expires_at": now + LEASE_SECONDS,
                ":force": force,
                ":true": True,
            },
        )
        return True
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            return False
        raise


def mark_week_complete(table, league_id, season, week, attempt_id, input_hash, now=None):
    now = int(time.time()) if now is None else int(now)
    table.update_item(
        Key={
            "data_type": FINALIZATION_DATA_TYPE,
            "id": finalization_id(league_id, season, week),
        },
        UpdateExpression=(
            "SET #status = :completed, completed_at = :now, input_hash = :input_hash "
            "REMOVE lease_expires_at, last_error"
        ),
        ConditionExpression="#status = :processing AND attempt_id = :attempt_id",
        ExpressionAttributeNames={"#status": "status"},
        ExpressionAttributeValues={
            ":completed": "completed",
            ":processing": "processing",
            ":attempt_id": attempt_id,
            ":now": now,
            ":input_hash": input_hash,
        },
    )


def mark_week_failed(table, league_id, season, week, attempt_id, error_message, now=None):
    now = int(time.time()) if now is None else int(now)
    try:
        table.update_item(
            Key={
                "data_type": FINALIZATION_DATA_TYPE,
                "id": finalization_id(league_id, season, week),
            },
            UpdateExpression=(
                "SET #status = :failed, failed_at = :now, last_error = :error "
                "REMOVE lease_expires_at"
            ),
            ConditionExpression="#status = :processing AND attempt_id = :attempt_id",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={
                ":failed": "failed",
                ":processing": "processing",
                ":attempt_id": attempt_id,
                ":now": now,
                ":error": error_message[:1000],
            },
        )
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") != "ConditionalCheckFailedException":
            raise


def fetch_sleeper_data(url, timeout=30):
    response = requests.get(url, timeout=timeout)
    response.raise_for_status()
    return response.json()


def cache_league_data(league_id, season, table):
    """Refresh all metadata needed by standings and playoff calculations."""
    users = fetch_sleeper_data(f"https://api.sleeper.app/v1/league/{league_id}/users")
    rosters = fetch_sleeper_data(f"https://api.sleeper.app/v1/league/{league_id}/rosters")
    league_info = fetch_sleeper_data(f"https://api.sleeper.app/v1/league/{league_id}")

    for user in users:
        table.put_item(Item=convert_floats_to_decimal({
            "data_type": "users",
            "id": user["user_id"],
            "season": season,
            "league_id": league_id,
            "data": user,
        }))
    for roster in rosters:
        table.put_item(Item=convert_floats_to_decimal({
            "data_type": "rosters",
            "id": str(roster["roster_id"]),
            "season": season,
            "league_id": league_id,
            "data": roster,
        }))
    table.put_item(Item=convert_floats_to_decimal({
        "data_type": "league_info",
        "id": "league",
        "season": season,
        "league_id": league_id,
        "data": league_info,
    }))

    player_ids = set()
    for roster in rosters:
        for field in ("players", "starters", "reserve", "taxi"):
            player_ids.update(roster.get(field) or [])

    all_players = fetch_sleeper_data("https://api.sleeper.app/v1/players/nfl", timeout=45)
    fields = ("first_name", "last_name", "position", "team")
    players = {
        player_id: {field: all_players.get(player_id, {}).get(field) for field in fields}
        for player_id in player_ids
    }
    table.put_item(Item=convert_floats_to_decimal({
        "data_type": "players",
        "id": "nfl_players",
        "season": season,
        "league_id": league_id,
        "data": players,
        "player_count": len(players),
        "storage_strategy": "league_roster_v1",
    }))
    return {str(roster["roster_id"]) for roster in rosters}


def validate_matchups(matchups, total_rosters, expected_roster_ids):
    """Reject partial or internally inconsistent Sleeper matchup snapshots."""
    if not isinstance(total_rosters, int) or isinstance(total_rosters, bool) or total_rosters < 1:
        raise ValueError("League context does not contain a valid total_rosters value")
    if not isinstance(matchups, list):
        raise ValueError("Sleeper matchup response must be a list")

    expected = {str(roster_id) for roster_id in expected_roster_ids}
    if len(expected) != total_rosters:
        raise ValueError(
            f"Sleeper roster metadata is incomplete: expected {total_rosters}, got {len(expected)}"
        )

    roster_ids = []
    for matchup in matchups:
        if not isinstance(matchup, dict) or matchup.get("roster_id") is None:
            raise ValueError("Sleeper matchup response contains an entry without a roster_id")
        roster_ids.append(str(matchup["roster_id"]))

    unique = set(roster_ids)
    if len(roster_ids) != len(unique):
        raise ValueError("Sleeper matchup response contains duplicate roster IDs")
    if len(unique) != total_rosters:
        raise ValueError(
            f"Sleeper matchup response is incomplete: expected {total_rosters}, got {len(unique)}"
        )
    if unique != expected:
        missing = sorted(expected - unique)
        unknown = sorted(unique - expected)
        raise ValueError(
            f"Sleeper matchup roster IDs do not match the league; missing={missing}, unknown={unknown}"
        )


def store_week_matchups(table, league_id, season, week, matchups, input_hash):
    table.put_item(Item=convert_floats_to_decimal({
        "data_type": "matchups",
        "id": finalization_id(league_id, season, week),
        "season": season,
        "league_id": league_id,
        "week": week,
        "input_hash": input_hash,
        "data": matchups,
    }))


def invoke_playoff_projection(lambda_client, function_name, finalized_weeks):
    response = lambda_client.invoke(
        FunctionName=function_name,
        InvocationType="RequestResponse",
        Payload=json.dumps({"source": "week-finalizer", "finalized_weeks": finalized_weeks}),
    )
    payload_stream = response.get("Payload")
    payload = json.loads(payload_stream.read()) if payload_stream else {}
    if response.get("FunctionError") or int(payload.get("statusCode", 200)) >= 400:
        raise RuntimeError(f"Playoff projection failed: {payload}")
    return payload


def run_finalization(event, league_context, tables, standings_service, lambda_client, attempt_id=None):
    league_id = league_context["league_id"]
    season = league_context["season"]
    completed_weeks = completed_regular_season_weeks(league_context)
    force_weeks = requested_force_weeks(event, completed_weeks)
    attempt_id = attempt_id or str(uuid.uuid4())
    state_table = tables["league_data"]

    acquired = [
        week for week in completed_weeks
        if acquire_week(
            state_table,
            league_id,
            season,
            week,
            attempt_id,
            force=week in force_weeks,
        )
    ]
    if not acquired:
        return {"season": season, "league_id": league_id, "weeks_processed": []}

    hashes = {}
    try:
        expected_roster_ids = cache_league_data(league_id, season, state_table)
        for week in acquired:
            matchups = fetch_sleeper_data(
                f"https://api.sleeper.app/v1/league/{league_id}/matchups/{week}"
            )
            validate_matchups(
                matchups,
                league_context.get("total_rosters"),
                expected_roster_ids,
            )
            input_hash = hashlib.sha256(
                json.dumps(matchups, sort_keys=True, separators=(",", ":")).encode("utf-8")
            ).hexdigest()
            store_week_matchups(state_table, league_id, season, week, matchups, input_hash)
            results = standings_service.calculate_and_store(
                matchups, league_id, season, week, include_player_details=True
            )
            if not results:
                raise RuntimeError(f"Sleeper returned no standings results for week {week}")
            hashes[week] = input_hash

        invoke_playoff_projection(
            lambda_client,
            os.environ["MONTE_CARLO_FUNCTION"],
            acquired,
        )
        for week in acquired:
            mark_week_complete(
                state_table, league_id, season, week, attempt_id, hashes[week]
            )
    except Exception as error:
        for week in acquired:
            mark_week_failed(
                state_table, league_id, season, week, attempt_id, str(error)
            )
        raise

    return {"season": season, "league_id": league_id, "weeks_processed": acquired}


def lambda_handler(event, context):
    dynamodb = boto3.resource("dynamodb")
    tables = {
        "league_data": dynamodb.Table(os.environ["LEAGUE_DATA_TABLE"]),
        "weekly_standings": dynamodb.Table(os.environ["WEEKLY_STANDINGS_TABLE"]),
        "overall_standings": dynamodb.Table(os.environ["OVERALL_STANDINGS_TABLE"]),
    }
    standings_service = StandingsService(tables, enable_persistent_cache=False)
    league_context = resolve_league_context_from_env()
    try:
        result = run_finalization(
            event or {},
            league_context,
            tables,
            standings_service,
            boto3.client("lambda"),
            getattr(context, "aws_request_id", None),
        )
        logger.info("Week finalization result: %s", result)
        return result
    except Exception:
        logger.exception("Week finalization failed")
        raise
