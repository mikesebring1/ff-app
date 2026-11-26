import importlib.util
import json
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
HANDLER_PATH = Path(__file__).parents[1] / "lambda" / "team-summary" / "lambda_function.py"
spec = importlib.util.spec_from_file_location("team_summary", HANDLER_PATH)
team_summary = importlib.util.module_from_spec(spec)
spec.loader.exec_module(team_summary)


LEAGUE_CONTEXT = {
    "season": "2026",
    "season_type": "regular",
    "display_week": 8,
    "league_id": "league-2026",
    "league_name": "Madtown's Finest",
}


class TeamSummaryTests(unittest.TestCase):
    def setUp(self):
        os.environ["LEAGUE_DATA_TABLE"] = "league-data"
        os.environ["OVERALL_STANDINGS_TABLE"] = "overall"

    def test_validates_request_body(self):
        self.assertEqual(
            team_summary.parse_request_body('{"roster_id": 4, "regenerate": true}'),
            {"roster_id": "4", "regenerate": True},
        )
        with self.assertRaisesRegex(team_summary.SummaryError, "roster_id"):
            team_summary.parse_request_body("{}")
        with self.assertRaisesRegex(team_summary.SummaryError, "boolean"):
            team_summary.parse_request_body('{"roster_id": "4", "regenerate": 1}')

    def test_builds_team_context_and_only_offers_unrostered_players(self):
        rosters = [
            {
                "roster_id": 1,
                "owner_id": "owner-1",
                "players": ["starter", "bench"],
                "starters": ["starter", "0"],
                "reserve": None,
                "taxi": None,
            },
            {"roster_id": 2, "players": ["taken"]},
        ]
        users = [{
            "user_id": "owner-1",
            "display_name": "Coach",
            "metadata": {"team_name": "Test Team"},
        }]
        projections = {
            "starter": {"pts_ppr": 20},
            "bench": {"pts_ppr": 8},
            "taken": {"pts_ppr": 18},
            "free": {"pts_ppr": 14},
        }
        league_data = Mock()
        league_data.get_item.return_value = {"Item": {
            "season": "2026",
            "league_id": "league-2026",
            "schema_version": 2,
            "data": {
                "starter": {"first_name": "Start", "last_name": "Player", "position": "QB", "team": "GB"},
                "bench": {"first_name": "Bench", "last_name": "Player", "position": "RB", "team": "DET"},
                "taken": {"first_name": "Taken", "last_name": "Player", "position": "WR", "team": "MIN"},
                "free": {"first_name": "Free", "last_name": "Agent", "position": "WR", "team": "CHI"},
            },
        }}
        overall = Mock()
        overall.get_item.return_value = {"Item": {
            "league_id": "league-2026",
            "total_wins": 10,
            "total_losses": 4,
            "total_points": 900,
            "playoff_percentage": 72,
        }}

        with patch.object(
            team_summary,
            "fetch_json",
            side_effect=[rosters, users, projections],
        ):
            context = team_summary.build_team_context(
                LEAGUE_CONTEXT,
                "1",
                league_data,
                overall,
            )

        self.assertEqual(context["team"]["name"], "Test Team")
        self.assertEqual(
            [player["roster_status"] for player in context["team"]["players"]],
            ["starter", "bench"],
        )
        self.assertEqual(
            [player["player_id"] for player in context["available_players"]],
            ["free"],
        )

    def test_filters_model_targets_to_supplied_free_agents(self):
        available = [{
            "player_id": "free",
            "name": "Free Agent",
            "position": "WR",
            "nfl_team": "GB",
            "projected_points": 10,
        }]
        result = team_summary.validate_summary({
            "identity": "A balanced roster.",
            "strengths": ["Strong receivers"],
            "gaps": ["Thin at running back"],
            "targets": [
                {"player_id": "hallucinated", "reason": "Not available"},
                {"player_id": "free", "reason": "Adds depth"},
            ],
            "strategy": ["Prioritize weekly upside"],
        }, available)

        self.assertEqual(result["targets"], [{**available[0], "reason": "Adds depth"}])

    def test_returns_matching_cache_without_calling_openrouter(self):
        context = {"team": {"roster_id": "1"}, "available_players": []}
        cached = {
            "context_hash": team_summary.context_hash(context),
            "generated_at": 1_000,
            "model": "google/gemini-2.5-flash",
            "summary": {"identity": "Cached"},
        }
        league_data = Mock()
        league_data.get_item.return_value = {"Item": cached}
        overall = Mock()
        team_summary.dynamodb.Table = Mock(side_effect=[league_data, overall])

        with patch.object(team_summary, "resolve_league_context_from_env", return_value=LEAGUE_CONTEXT), patch.object(
            team_summary, "build_team_context", return_value=context
        ), patch.object(team_summary, "call_openrouter") as openrouter:
            result = team_summary.generate_or_get_summary("1", now=1_100)

        self.assertTrue(result["cached"])
        self.assertEqual(result["summary"]["identity"], "Cached")
        openrouter.assert_not_called()

    def test_enforces_regeneration_cooldown(self):
        context = {"team": {"roster_id": "1"}, "available_players": []}
        league_data = Mock()
        league_data.get_item.return_value = {"Item": {
            "context_hash": team_summary.context_hash(context),
            "generated_at": 1_000,
            "summary": {"identity": "Cached"},
        }}
        overall = Mock()
        team_summary.dynamodb.Table = Mock(side_effect=[league_data, overall])

        with patch.object(team_summary, "resolve_league_context_from_env", return_value=LEAGUE_CONTEXT), patch.object(
            team_summary, "build_team_context", return_value=context
        ), patch.object(team_summary, "call_openrouter") as openrouter:
            result = team_summary.generate_or_get_summary(
                "1", regenerate=True, now=1_100
            )

        self.assertTrue(result["cooldown_active"])
        self.assertEqual(result["regenerate_after"], 1_900)
        openrouter.assert_not_called()


if __name__ == "__main__":
    unittest.main()
