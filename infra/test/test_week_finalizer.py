import importlib.util
import os
import sys
import types
import unittest
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


if __name__ == "__main__":
    unittest.main()
