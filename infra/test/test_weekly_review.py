import importlib.util
import os
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


boto3 = sys.modules.setdefault("boto3", types.ModuleType("boto3"))
boto3.resource = Mock(return_value=Mock())
boto3.client = Mock(return_value=Mock())
requests = sys.modules.setdefault("requests", types.ModuleType("requests"))
requests.get = Mock()
requests.post = Mock()

COMMON_UTILS = Path(__file__).parents[1] / "layers" / "common-utils" / "python"
sys.path.insert(0, str(COMMON_UTILS))
HANDLER_PATH = Path(__file__).parents[1] / "lambda" / "weekly-review" / "lambda_function.py"
spec = importlib.util.spec_from_file_location("weekly_review", HANDLER_PATH)
weekly_review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(weekly_review)


LEAGUE_CONTEXT = {
    "season": "2026",
    "season_type": "regular",
    "display_week": 8,
    "league_id": "league-2026",
    "league_name": "Madtown's Finest",
}


class WeeklyReviewTests(unittest.TestCase):
    def setUp(self):
        os.environ["LEAGUE_DATA_TABLE"] = "league-data"
        os.environ["WEEKLY_STANDINGS_TABLE"] = "weekly"

    def test_validates_week_request(self):
        self.assertEqual(weekly_review.parse_request_body('{"week": 7}'), 7)
        self.assertEqual(weekly_review.parse_request_body('{"week": "12"}'), 12)
        for invalid_body in ("{}", '{"week": 0}', '{"week": 19}', '{"week": true}'):
            with self.assertRaisesRegex(weekly_review.ReviewError, "week"):
                weekly_review.parse_request_body(invalid_body)

    def test_calculates_eligible_optimal_lineup_and_missed_swap(self):
        matchup = {
            "starters": ["qb-start", "rb-start"],
            "players": ["qb-start", "rb-start", "rb-bench", "wr-bench"],
            "players_points": {
                "qb-start": 10,
                "rb-start": 5,
                "rb-bench": 20,
                "wr-bench": 30,
            },
        }
        players = {
            "qb-start": {"first_name": "Good", "last_name": "QB", "position": "QB"},
            "rb-start": {"first_name": "Wrong", "last_name": "RB", "position": "RB"},
            "rb-bench": {"first_name": "Bench", "last_name": "RB", "position": "RB"},
            "wr-bench": {"first_name": "Bench", "last_name": "WR", "position": "WR"},
        }

        lineup = weekly_review.build_lineup_analysis(matchup, players)

        self.assertEqual(lineup["starter_points"], 15)
        self.assertEqual(lineup["optimal_points"], 30)
        self.assertEqual(lineup["points_left_on_bench"], 15)
        self.assertEqual(lineup["lineup_efficiency"], 50)
        self.assertEqual(lineup["missed_swaps"], [{
            "slot": "RB",
            "started": "Wrong RB",
            "sat": "Bench RB",
            "points_gained": 15,
        }])

    def test_builds_ranked_context_from_finalized_facts(self):
        standings = [
            {"team_id": "2", "team_name": "Second", "rank": 2, "points": 90, "wins": 0, "losses": 1},
            {"team_id": "1", "team_name": "First", "rank": 1, "points": 110, "wins": 1, "losses": 0},
        ]
        matchups = [
            {"roster_id": 1, "starters": ["one"], "players": ["one"], "players_points": {"one": 110}},
            {"roster_id": 2, "starters": ["two"], "players": ["two"], "players_points": {"two": 90}},
        ]
        players = {
            "one": {"first_name": "Player", "last_name": "One", "position": "QB"},
            "two": {"first_name": "Player", "last_name": "Two", "position": "QB"},
        }

        context = weekly_review.build_week_context(
            LEAGUE_CONTEXT, 7, matchups, standings, players
        )

        self.assertEqual(context["league"]["average_points"], 100)
        self.assertEqual([team["roster_id"] for team in context["teams"]], ["1", "2"])
        self.assertEqual(context["teams"][0]["record"], "1-0")

    def test_validates_every_team_and_enriches_model_copy(self):
        context = {
            "teams": [
                {"roster_id": "1", "team_name": "First", "rank": 1, "points": 110, "record": "1-0", "lineup": {"points_left_on_bench": 0, "lineup_efficiency": 100}},
                {"roster_id": "2", "team_name": "Second", "rank": 2, "points": 90, "record": "0-1", "lineup": {"points_left_on_bench": 12, "lineup_efficiency": 88}},
            ]
        }
        model_review = {
            "headline": "A week happened",
            "overview": "First won. Second did not.",
            "teams": [
                {"roster_id": "1", "performance": "Best score.", "lineup": "No notes.", "verdict": "Competent."},
                {"roster_id": "2", "performance": "Second place.", "lineup": "Left points sitting.", "verdict": "Own goal."},
            ],
        }

        result = weekly_review.validate_review(model_review, context)

        self.assertEqual(result["teams"][0]["team_name"], "First")
        self.assertEqual(result["teams"][1]["points_left_on_bench"], 12)
        with self.assertRaisesRegex(weekly_review.ReviewError, "every team"):
            weekly_review.validate_review({**model_review, "teams": model_review["teams"][:1]}, context)

    def test_returns_permanent_cache_without_rebuilding_context(self):
        cached = {
            "week": 7,
            "generated_at": 1_000,
            "model": "google/gemini-2.5-flash",
            "review": {"headline": "Cached", "overview": "Done", "teams": []},
        }
        league_data = Mock()
        league_data.get_item.return_value = {"Item": cached}
        weekly = Mock()
        weekly_review.dynamodb.Table = Mock(side_effect=[league_data, weekly])

        with patch.object(
            weekly_review,
            "resolve_league_context_from_env",
            return_value=LEAGUE_CONTEXT,
        ), patch.object(weekly_review, "load_finalized_data") as load_data, patch.object(
            weekly_review, "call_openrouter"
        ) as openrouter:
            result = weekly_review.generate_or_get_review(7, now=2_000)

        self.assertTrue(result["cached"])
        self.assertEqual(result["review"]["headline"], "Cached")
        load_data.assert_not_called()
        openrouter.assert_not_called()


if __name__ == "__main__":
    unittest.main()
