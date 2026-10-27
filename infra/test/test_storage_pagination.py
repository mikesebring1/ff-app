import sys
import types
import unittest
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch


sys.modules.setdefault("boto3", types.ModuleType("boto3"))
STANDINGS_SOURCE = Path(__file__).parents[2] / "packages" / "ff-standings" / "src"
sys.path.insert(0, str(STANDINGS_SOURCE))

from ff_standings import storage  # noqa: E402


class Expression:
    def begins_with(self, value):
        return self

    def eq(self, value):
        return self

    def __and__(self, other):
        return self


class Conditions:
    @staticmethod
    def Attr(name):
        return Expression()


class PaginatedWeeklyTable:
    def __init__(self):
        self.calls = []

    def scan(self, **kwargs):
        self.calls.append(kwargs)
        if "ExclusiveStartKey" not in kwargs:
            return {
                "Items": [weekly_item("1", 9, 0, 100, 1)],
                "LastEvaluatedKey": {"season_week": "2026_1", "team_id": "1"},
            }
        return {"Items": [weekly_item("1", 8, 1, 90, 2)]}


class OverallTable:
    def __init__(self):
        self.items = []

    def get_item(self, **kwargs):
        return {}

    def put_item(self, Item):
        self.items.append(Item)


class ExistingOverallTable:
    def __init__(self):
        self.item = {
            "season": "2026",
            "team_id": "1",
            "league_id": "league-2026",
            "team_name": "Old Name",
            "total_wins": Decimal("17"),
            "playoff_percentage": Decimal("42.5"),
        }
        self.update_calls = []

    def get_item(self, Key):
        if Key == {"season": "2026", "team_id": "1"}:
            return {"Item": dict(self.item)}
        return {}

    def update_item(self, **kwargs):
        self.update_calls.append(kwargs)
        self.item["team_name"] = kwargs["ExpressionAttributeValues"][":team_name"]


def weekly_item(team_id, wins, losses, points, rank):
    return {
        "team_id": team_id,
        "team_name": "Team One",
        "wins": Decimal(str(wins)),
        "losses": Decimal(str(losses)),
        "points": Decimal(str(points)),
        "rank": Decimal(str(rank)),
    }


class OverallPaginationTests(unittest.TestCase):
    def test_overall_recompute_includes_every_scan_page(self):
        weekly = PaginatedWeeklyTable()
        overall = OverallTable()
        fake_boto3 = types.SimpleNamespace(
            dynamodb=types.SimpleNamespace(conditions=Conditions)
        )

        with patch.object(storage, "boto3", fake_boto3):
            storage.StandingsStorage(weekly, overall).update_overall_standings(
                "league-2026", "2026", {"1": "Current Name"}
            )

        self.assertEqual(len(weekly.calls), 2)
        self.assertEqual(
            weekly.calls[1]["ExclusiveStartKey"],
            {"season_week": "2026_1", "team_id": "1"},
        )
        self.assertEqual(len(overall.items), 1)
        self.assertEqual(overall.items[0]["total_wins"], Decimal("17.0"))
        self.assertEqual(overall.items[0]["total_losses"], Decimal("1.0"))
        self.assertEqual(overall.items[0]["total_points"], Decimal("190.0"))
        self.assertEqual(overall.items[0]["earnings"], 25)
        self.assertEqual(overall.items[0]["team_name"], "Current Name")

    def test_name_sync_updates_only_the_name_on_existing_overall_rows(self):
        overall = ExistingOverallTable()
        standings = storage.StandingsStorage(None, overall)

        updated = standings.sync_overall_team_names(
            "league-2026",
            "2026",
            {"1": "New Name", "2": "No Standings Yet"},
        )

        self.assertEqual(updated, 1)
        self.assertEqual(overall.item["team_name"], "New Name")
        self.assertEqual(overall.item["total_wins"], Decimal("17"))
        self.assertEqual(overall.item["playoff_percentage"], Decimal("42.5"))
        self.assertEqual(len(overall.update_calls), 1)
        self.assertEqual(
            overall.update_calls[0]["UpdateExpression"],
            "SET team_name = :team_name",
        )


if __name__ == "__main__":
    unittest.main()
