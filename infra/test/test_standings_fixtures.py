import json
import sys
import types
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).parents[2]
STANDINGS_SOURCE = REPOSITORY_ROOT / "packages" / "ff-standings" / "src"
FIXTURES_PATH = (
    REPOSITORY_ROOT
    / "packages"
    / "ff-standings"
    / "fixtures"
    / "weekly-standings.json"
)
sys.path.insert(0, str(STANDINGS_SOURCE))
sys.modules.setdefault("boto3", types.ModuleType("boto3"))

from ff_standings.calculator import StandingsCalculator  # noqa: E402


RESULT_FIELDS = (
    "roster_id",
    "team_name",
    "rank",
    "points",
    "wins",
    "losses",
)


class SharedStandingsFixtureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixtures = json.loads(FIXTURES_PATH.read_text())["cases"]
        cls.calculator = StandingsCalculator()

    def test_python_calculator_matches_shared_fixtures(self):
        for fixture in self.fixtures:
            with self.subTest(fixture=fixture["name"]):
                actual = self.calculator.calculate_weekly_vs_everyone(
                    fixture["matchups"],
                    fixture["team_names"],
                )
                normalized = [
                    {field: result[field] for field in RESULT_FIELDS}
                    for result in actual
                ]
                self.assertEqual(normalized, fixture["expected"])


if __name__ == "__main__":
    unittest.main()
