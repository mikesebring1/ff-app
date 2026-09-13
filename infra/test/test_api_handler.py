import importlib.util
import json
import sys
import types
import unittest
from decimal import Decimal
from pathlib import Path
from unittest.mock import Mock


boto3 = sys.modules.setdefault("boto3", types.ModuleType("boto3"))
boto3.resource = Mock(return_value=Mock())

COMMON_UTILS = Path(__file__).parents[1] / "layers" / "common-utils" / "python"
sys.path.insert(0, str(COMMON_UTILS))
HANDLER_PATH = Path(__file__).parents[1] / "lambda" / "api-handler" / "lambda_function.py"
spec = importlib.util.spec_from_file_location("api_handler", HANDLER_PATH)
api_handler = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api_handler)


class PlayerEndpointTests(unittest.TestCase):
    def test_returns_compact_map_and_cache_headers_for_matching_context(self):
        table = Mock()
        table.get_item.return_value = {
            "Item": {
                "data_type": "players",
                "id": "nfl_players",
                "season": "2026",
                "league_id": "league-2026",
                "schema_version": Decimal("2"),
                "refreshed_at": Decimal("1000"),
                "player_count": Decimal("1"),
                "data": {
                    "qb": {
                        "first_name": "Quarter",
                        "last_name": "Back",
                        "position": "QB",
                        "team": "GB",
                    }
                },
            }
        }

        result = api_handler.handle_players(
            table,
            {"season": "2026", "league_id": "league-2026"},
            "https://madtownsfinest.app",
        )

        self.assertEqual(result["statusCode"], 200)
        self.assertEqual(result["headers"]["Cache-Control"], "public, max-age=86400")
        self.assertEqual(
            result["headers"]["Access-Control-Allow-Origin"],
            "https://madtownsfinest.app",
        )
        body = json.loads(result["body"])
        self.assertEqual(body["players"]["qb"]["team"], "GB")
        self.assertEqual(body["player_count"], 1.0)
        table.get_item.assert_called_once_with(
            Key={"data_type": "players", "id": "nfl_players"}
        )

    def test_rejects_missing_query_and_unavailable_context(self):
        table = Mock()
        missing = api_handler.handle_players(table, {"season": "2026"})
        self.assertEqual(missing["statusCode"], 400)
        table.get_item.assert_not_called()

        table.get_item.return_value = {
            "Item": {
                "season": "2025",
                "league_id": "old-league",
                "data": {},
            }
        }
        unavailable = api_handler.handle_players(
            table, {"season": "2026", "league_id": "league-2026"}
        )
        self.assertEqual(unavailable["statusCode"], 404)

    def test_waits_for_the_versioned_cache_after_infrastructure_deploy(self):
        table = Mock()
        table.get_item.return_value = {
            "Item": {
                "season": "2026",
                "league_id": "league-2026",
                "player_count": 1,
                "data": {"qb": {"position": "QB", "team": "GB"}},
            }
        }
        result = api_handler.handle_players(
            table, {"season": "2026", "league_id": "league-2026"}
        )
        self.assertEqual(result["statusCode"], 503)
        self.assertIn("being refreshed", result["body"])


if __name__ == "__main__":
    unittest.main()
