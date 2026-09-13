import importlib.util
import os
import sys
import types
import unittest
from decimal import Decimal
from pathlib import Path
from unittest.mock import Mock, patch


class FakeClientError(Exception):
    def __init__(self, code):
        self.response = {"Error": {"Code": code}}


sys.modules.setdefault("boto3", types.ModuleType("boto3"))
sys.modules.setdefault("requests", types.ModuleType("requests"))
botocore = types.ModuleType("botocore")
botocore_exceptions = types.ModuleType("botocore.exceptions")
botocore_exceptions.ClientError = FakeClientError
sys.modules.setdefault("botocore", botocore)
sys.modules.setdefault("botocore.exceptions", botocore_exceptions)
ff_standings = types.ModuleType("ff_standings")
ff_standings.StandingsService = object
sys.modules.setdefault("ff_standings", ff_standings)

COMMON_UTILS = Path(__file__).parents[1] / "layers" / "common-utils" / "python"
sys.path.insert(0, str(COMMON_UTILS))
FINALIZER_PATH = (
    Path(__file__).parents[1] / "lambda" / "week-finalizer" / "lambda_function.py"
)
spec = importlib.util.spec_from_file_location("week_finalizer", FINALIZER_PATH)
week_finalizer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(week_finalizer)


def context(week=5, season_type="regular", league_status="in_season"):
    return {
        "league_id": "league-2026",
        "season": "2026",
        "week": week,
        "season_type": season_type,
        "league_status": league_status,
        "total_rosters": 2,
        "settings": {"playoff_week_start": 16},
    }


class WeekDetectionTests(unittest.TestCase):
    def test_regular_season_catches_up_every_week_before_current(self):
        self.assertEqual(
            week_finalizer.completed_regular_season_weeks(context(5)),
            [1, 2, 3, 4],
        )

    def test_postseason_includes_every_regular_season_week(self):
        self.assertEqual(
            week_finalizer.completed_regular_season_weeks(context(17, "post")),
            list(range(1, 16)),
        )

    def test_force_reprocess_only_accepts_completed_weeks(self):
        self.assertEqual(
            week_finalizer.requested_force_weeks({"force_week": 3}, [1, 2, 3, 4]),
            {3},
        )
        with self.assertRaisesRegex(ValueError, "not a completed"):
            week_finalizer.requested_force_weeks({"force_week": 5}, [1, 2, 3, 4])


class IdempotencyTests(unittest.TestCase):
    def test_active_season_run_is_skipped_before_week_acquisition(self):
        tables = {"league_data": Mock()}
        acquire_week = Mock()

        with patch.object(week_finalizer, "acquire_run_lease", return_value=False), \
             patch.object(week_finalizer, "acquire_week", acquire_week):
            result = week_finalizer.run_finalization(
                {}, context(3), tables, Mock(), Mock(), "blocked-attempt"
            )

        self.assertEqual(result["weeks_processed"], [])
        self.assertEqual(result["skipped"], "finalization_already_running")
        acquire_week.assert_not_called()

    def test_season_run_lease_is_conditional_and_retryable_after_expiry(self):
        table = Mock()
        table.update_item.side_effect = FakeClientError("ConditionalCheckFailedException")

        self.assertFalse(
            week_finalizer.acquire_run_lease(
                table, "league-2026", "2026", "attempt-2", now=100
            )
        )
        condition = table.update_item.call_args.kwargs["ConditionExpression"]
        self.assertIn("lease_expires_at < :now", condition)

    def test_season_run_lease_is_released_when_no_week_needs_processing(self):
        tables = {"league_data": Mock()}

        with patch.object(week_finalizer, "acquire_run_lease", return_value=True), \
             patch.object(week_finalizer, "ensure_player_cache", return_value=False), \
             patch.object(week_finalizer, "acquire_week", return_value=False), \
             patch.object(week_finalizer, "release_run_lease") as release:
            result = week_finalizer.run_finalization(
                {}, context(3), tables, Mock(), Mock(), "idle-attempt"
            )

        self.assertEqual(result["weeks_processed"], [])
        release.assert_called_once_with(
            tables["league_data"], "league-2026", "2026", "idle-attempt"
        )

    def test_completed_or_active_week_is_not_acquired(self):
        table = Mock()
        table.update_item.side_effect = FakeClientError("ConditionalCheckFailedException")

        acquired = week_finalizer.acquire_week(
            table, "league-2026", "2026", 1, "attempt-2", now=100
        )

        self.assertFalse(acquired)

    def test_failed_batch_is_retryable_and_only_success_is_completed(self):
        table = Mock()
        tables = {"league_data": table}
        standings = Mock()
        standings.calculate_and_store.return_value = [{"team_id": "1"}]
        lambda_client = Mock()
        matchups = [
            {"roster_id": 1, "points": 100},
            {"roster_id": 2, "points": 90},
        ]

        common_patches = (
            patch.object(week_finalizer, "acquire_week", return_value=True),
            patch.object(week_finalizer, "cache_league_data", return_value={"1", "2"}),
            patch.object(week_finalizer, "fetch_sleeper_data", return_value=matchups),
            patch.object(week_finalizer, "store_week_matchups"),
        )
        with common_patches[0], common_patches[1], common_patches[2], common_patches[3], \
             patch.object(week_finalizer, "ensure_player_cache", return_value=False), \
             patch.object(week_finalizer, "invoke_playoff_projection", side_effect=RuntimeError("boom")), \
             patch.object(week_finalizer, "mark_week_failed") as mark_failed, \
             patch.object(week_finalizer, "mark_week_complete") as mark_complete, \
             patch.object(week_finalizer, "release_run_lease") as release_run, \
             patch.dict(os.environ, {"MONTE_CARLO_FUNCTION": "mc"}):
            with self.assertRaisesRegex(RuntimeError, "boom"):
                week_finalizer.run_finalization(
                    {}, context(3), tables, standings, lambda_client, "attempt-1"
                )
            self.assertEqual(mark_failed.call_count, 2)
            mark_complete.assert_not_called()
            release_run.assert_called_once_with(
                table, "league-2026", "2026", "attempt-1"
            )

        with patch.object(week_finalizer, "acquire_week", return_value=True), \
             patch.object(week_finalizer, "ensure_player_cache", return_value=False), \
             patch.object(week_finalizer, "cache_league_data", return_value={"1", "2"}), \
             patch.object(week_finalizer, "fetch_sleeper_data", return_value=matchups), \
             patch.object(week_finalizer, "store_week_matchups"), \
             patch.object(week_finalizer, "invoke_playoff_projection"), \
             patch.object(week_finalizer, "mark_week_failed") as retry_failed, \
             patch.object(week_finalizer, "mark_week_complete") as retry_complete, \
             patch.dict(os.environ, {"MONTE_CARLO_FUNCTION": "mc"}):
            result = week_finalizer.run_finalization(
                {}, context(3), tables, standings, lambda_client, "attempt-2"
            )

        self.assertEqual(result["weeks_processed"], [1, 2])
        retry_failed.assert_not_called()
        self.assertEqual(
            [completed.args[3] for completed in retry_complete.call_args_list],
            [1, 2],
        )

    def test_force_flag_is_applied_only_to_requested_week(self):
        tables = {"league_data": Mock()}
        standings = Mock()
        standings.calculate_and_store.return_value = [{"team_id": "1"}]
        acquire = Mock(return_value=True)
        with patch.object(week_finalizer, "acquire_week", acquire), \
             patch.object(week_finalizer, "ensure_player_cache", return_value=False), \
             patch.object(week_finalizer, "cache_league_data", return_value={"1", "2"}), \
             patch.object(week_finalizer, "fetch_sleeper_data", return_value=[{"roster_id": 1}, {"roster_id": 2}]), \
             patch.object(week_finalizer, "store_week_matchups"), \
             patch.object(week_finalizer, "invoke_playoff_projection"), \
             patch.object(week_finalizer, "mark_week_complete"), \
             patch.dict(os.environ, {"MONTE_CARLO_FUNCTION": "mc"}):
            week_finalizer.run_finalization(
                {"force_week": 2}, context(4), tables, standings, Mock(), "attempt"
            )

        self.assertEqual(
            [invocation.kwargs["force"] for invocation in acquire.call_args_list],
            [False, True, False],
        )


class MatchupValidationTests(unittest.TestCase):
    def test_rejects_partial_duplicate_and_unknown_roster_sets(self):
        with self.assertRaisesRegex(ValueError, "incomplete"):
            week_finalizer.validate_matchups([{"roster_id": 1}], 2, {"1", "2"})
        with self.assertRaisesRegex(ValueError, "duplicate"):
            week_finalizer.validate_matchups(
                [{"roster_id": 1}, {"roster_id": 1}], 2, {"1", "2"}
            )
        with self.assertRaisesRegex(ValueError, "do not match"):
            week_finalizer.validate_matchups(
                [{"roster_id": 1}, {"roster_id": 3}], 2, {"1", "2"}
            )

    def test_partial_forced_response_writes_no_week_and_next_run_can_retry(self):
        tables = {"league_data": Mock()}
        standings = Mock()
        lambda_client = Mock()

        with patch.object(week_finalizer, "acquire_week", return_value=True) as acquire, \
             patch.object(week_finalizer, "ensure_player_cache", return_value=False), \
             patch.object(week_finalizer, "cache_league_data", return_value={"1", "2"}), \
             patch.object(week_finalizer, "fetch_sleeper_data", return_value=[{"roster_id": 1}]), \
             patch.object(week_finalizer, "store_week_matchups") as store_week, \
             patch.object(week_finalizer, "mark_week_failed") as mark_failed, \
             patch.object(week_finalizer, "mark_week_complete") as mark_complete, \
             patch.dict(os.environ, {"MONTE_CARLO_FUNCTION": "mc"}):
            with self.assertRaisesRegex(ValueError, "incomplete"):
                week_finalizer.run_finalization(
                    {"force_week": 1}, context(2), tables, standings, lambda_client, "forced"
                )
            self.assertTrue(acquire.call_args.kwargs["force"])
            store_week.assert_not_called()
            standings.calculate_and_store.assert_not_called()
            mark_complete.assert_not_called()
            mark_failed.assert_called_once()

        standings.calculate_and_store.return_value = [{"team_id": "1"}]
        with patch.object(week_finalizer, "acquire_week", return_value=True), \
             patch.object(week_finalizer, "ensure_player_cache", return_value=False), \
             patch.object(week_finalizer, "cache_league_data", return_value={"1", "2"}), \
             patch.object(
                 week_finalizer,
                 "fetch_sleeper_data",
                 return_value=[{"roster_id": 1}, {"roster_id": 2}],
             ), \
             patch.object(week_finalizer, "store_week_matchups") as retry_store, \
             patch.object(week_finalizer, "invoke_playoff_projection"), \
             patch.object(week_finalizer, "mark_week_complete") as retry_complete, \
             patch.dict(os.environ, {"MONTE_CARLO_FUNCTION": "mc"}):
            result = week_finalizer.run_finalization(
                {}, context(2), tables, standings, lambda_client, "retry"
            )

        self.assertEqual(result["weeks_processed"], [1])
        retry_store.assert_called_once()
        retry_complete.assert_called_once()


class PlayerCacheTests(unittest.TestCase):
    def test_compacts_active_non_kickers_to_the_exact_ui_fields(self):
        all_players = {
            "qb": {
                "first_name": "Quarter",
                "last_name": "Back",
                "position": "QB",
                "team": "GB",
                "age": 25,
                "fantasy_positions": ["QB"],
            },
            "kicker": {
                "first_name": "Place",
                "last_name": "Kicker",
                "position": "K",
                "team": "GB",
            },
            "free-agent": {
                "first_name": "Free",
                "last_name": "Agent",
                "position": "WR",
                "team": None,
            },
            "def": {
                "first_name": None,
                "last_name": None,
                "position": "DEF",
                "team": "CHI",
            },
        }

        item = week_finalizer.build_player_cache_item(
            all_players, "league-2026", "2026", now=1_000
        )

        self.assertEqual(set(item["data"]), {"qb", "def"})
        self.assertEqual(
            item["data"]["qb"],
            {
                "first_name": "Quarter",
                "last_name": "Back",
                "position": "QB",
                "team": "GB",
            },
        )
        self.assertEqual(item["player_count"], 2)
        self.assertEqual(item["filtering_info"]["original_count"], 4)
        self.assertEqual(item["schema_version"], 2)

    def test_freshness_requires_matching_context_schema_and_weekly_ttl(self):
        item = week_finalizer.build_player_cache_item(
            {"qb": {"position": "QB", "team": "GB"}},
            "league-2026",
            "2026",
            now=1_000,
        )
        self.assertTrue(
            week_finalizer.player_cache_is_fresh(
                item, "league-2026", "2026", now=1_000 + 604_799
            )
        )
        item["refreshed_at"] = Decimal("1000")
        self.assertTrue(
            week_finalizer.player_cache_is_fresh(
                item, "league-2026", "2026", now=1_001
            )
        )
        self.assertFalse(
            week_finalizer.player_cache_is_fresh(
                item, "league-2026", "2026", now=1_000 + 604_800
            )
        )
        self.assertFalse(
            week_finalizer.player_cache_is_fresh(
                item, "other-league", "2026", now=1_001
            )
        )

    def test_rejects_a_map_too_close_to_dynamodb_item_limit(self):
        players = {
            str(index): {
                "first_name": "A" * 50,
                "last_name": "B" * 50,
                "position": "WR",
                "team": "GB",
            }
            for index in range(5)
        }
        with patch.object(week_finalizer, "MAX_PLAYER_CACHE_BYTES", 200):
            with self.assertRaisesRegex(ValueError, "too large"):
                week_finalizer.build_player_cache_item(
                    players, "league-2026", "2026", now=1_000
                )

    def test_rejects_an_empty_or_malformed_sleeper_directory(self):
        with self.assertRaisesRegex(ValueError, "must be an object"):
            week_finalizer.build_player_cache_item(
                [], "league-2026", "2026", now=1_000
            )
        with self.assertRaisesRegex(ValueError, "no active non-kickers"):
            week_finalizer.build_player_cache_item(
                {"free-agent": {"position": "WR", "team": None}},
                "league-2026",
                "2026",
                now=1_000,
            )

    def test_completed_week_uses_stale_compatible_map_when_refresh_fails(self):
        table = Mock()
        tables = {"league_data": table}
        standings = Mock()
        standings.calculate_and_store.return_value = [{"team_id": "1"}]
        stale_item = week_finalizer.build_player_cache_item(
            {"qb": {"position": "QB", "team": "GB"}},
            "league-2026",
            "2026",
            now=1_000,
        )
        matchups = [
            {"roster_id": 1, "points": 100},
            {"roster_id": 2, "points": 90},
        ]

        with patch.object(week_finalizer.time, "time", return_value=700_000), \
             patch.object(
                 week_finalizer, "get_player_cache_item", return_value=stale_item
             ), \
             patch.object(
                 week_finalizer,
                 "refresh_player_cache",
                 side_effect=RuntimeError("Sleeper unavailable"),
             ), \
             patch.object(week_finalizer, "acquire_run_lease", return_value=True), \
             patch.object(week_finalizer, "acquire_week", return_value=True), \
             patch.object(
                 week_finalizer, "cache_league_data", return_value={"1", "2"}
             ), \
             patch.object(
                 week_finalizer, "fetch_sleeper_data", return_value=matchups
             ), \
             patch.object(week_finalizer, "store_week_matchups") as store_week, \
             patch.object(week_finalizer, "invoke_playoff_projection") as playoffs, \
             patch.object(week_finalizer, "mark_week_complete") as complete, \
             patch.object(week_finalizer, "release_run_lease"), \
             patch.dict(os.environ, {"MONTE_CARLO_FUNCTION": "mc"}), \
             self.assertLogs(level="ERROR") as logs:
            result = week_finalizer.run_finalization(
                {}, context(2), tables, standings, Mock(), "degraded"
            )

        self.assertEqual(result["weeks_processed"], [1])
        self.assertFalse(result["player_cache_refreshed"])
        self.assertIn("stale compatible map", " ".join(logs.output))
        store_week.assert_called_once()
        standings.calculate_and_store.assert_called_once()
        playoffs.assert_called_once()
        complete.assert_called_once()

    def test_completed_week_fails_when_player_cache_bootstrap_fails(self):
        table = Mock()
        tables = {"league_data": table}

        with patch.object(
                 week_finalizer, "get_player_cache_item", return_value=None
             ), \
             patch.object(
                 week_finalizer,
                 "refresh_player_cache",
                 side_effect=RuntimeError("Sleeper unavailable"),
             ), \
             patch.object(week_finalizer, "acquire_run_lease", return_value=True), \
             patch.object(week_finalizer, "acquire_week") as acquire_week, \
             patch.object(week_finalizer, "release_run_lease") as release:
            with self.assertRaisesRegex(RuntimeError, "Sleeper unavailable"):
                week_finalizer.run_finalization(
                    {}, context(2), tables, Mock(), Mock(), "bootstrap"
                )

        acquire_week.assert_not_called()
        release.assert_called_once_with(
            table, "league-2026", "2026", "bootstrap"
        )

    def test_incompatible_cache_cannot_mask_a_refresh_failure(self):
        incompatible_item = week_finalizer.build_player_cache_item(
            {"qb": {"position": "QB", "team": "GB"}},
            "league-2026",
            "2026",
            now=1_000,
        )
        incompatible_item["schema_version"] = 1

        with patch.object(
                 week_finalizer,
                 "get_player_cache_item",
                 return_value=incompatible_item,
             ), \
             patch.object(
                 week_finalizer,
                 "refresh_player_cache",
                 side_effect=ValueError("cache too large"),
             ):
            with self.assertRaisesRegex(ValueError, "cache too large"):
                week_finalizer.ensure_player_cache(
                    Mock(),
                    "league-2026",
                    "2026",
                    allow_stale_on_error=True,
                )

    def test_week_one_bootstraps_under_lease_and_rechecks_freshness(self):
        table = Mock()
        tables = {"league_data": table}
        fresh_item = week_finalizer.build_player_cache_item(
            {"qb": {"position": "QB", "team": "GB"}},
            "league-2026",
            "2026",
            now=1_000,
        )

        with patch.object(week_finalizer.time, "time", return_value=1_001), \
             patch.object(
                 week_finalizer,
                 "get_player_cache_item",
                 side_effect=[None, fresh_item],
             ) as get_item, \
             patch.object(week_finalizer, "acquire_run_lease", return_value=True), \
             patch.object(week_finalizer, "refresh_player_cache") as refresh, \
             patch.object(week_finalizer, "acquire_week") as acquire_week, \
             patch.object(week_finalizer, "release_run_lease") as release:
            result = week_finalizer.run_finalization(
                {}, context(1), tables, Mock(), Mock(), "week-one"
            )

        self.assertEqual(get_item.call_count, 2)
        refresh.assert_not_called()
        acquire_week.assert_not_called()
        self.assertFalse(result["player_cache_refreshed"])
        release.assert_called_once_with(table, "league-2026", "2026", "week-one")

    def test_week_one_fresh_cache_skips_the_lease(self):
        table = Mock()
        tables = {"league_data": table}
        fresh_item = week_finalizer.build_player_cache_item(
            {"qb": {"position": "QB", "team": "GB"}},
            "league-2026",
            "2026",
            now=1_000,
        )

        with patch.object(week_finalizer.time, "time", return_value=1_001), \
             patch.object(
                 week_finalizer, "get_player_cache_item", return_value=fresh_item
             ), \
             patch.object(week_finalizer, "acquire_run_lease") as acquire_lease:
            result = week_finalizer.run_finalization(
                {}, context(1), tables, Mock(), Mock(), "week-one"
            )

        acquire_lease.assert_not_called()
        self.assertFalse(result["player_cache_refreshed"])

    def test_week_one_stale_cache_is_refreshed_without_week_processing(self):
        table = Mock()
        tables = {"league_data": table}

        with patch.object(
                 week_finalizer, "get_player_cache_item", return_value=None
             ), \
             patch.object(week_finalizer, "acquire_run_lease", return_value=True), \
             patch.object(week_finalizer, "refresh_player_cache") as refresh, \
             patch.object(week_finalizer, "acquire_week") as acquire_week, \
             patch.object(week_finalizer, "release_run_lease"):
            result = week_finalizer.run_finalization(
                {}, context(1), tables, Mock(), Mock(), "week-one"
            )

        refresh.assert_called_once_with(table, "league-2026", "2026", now=None)
        acquire_week.assert_not_called()
        self.assertTrue(result["player_cache_refreshed"])


if __name__ == "__main__":
    unittest.main()
