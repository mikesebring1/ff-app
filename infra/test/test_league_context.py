import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


COMMON_UTILS = Path(__file__).parents[1] / "layers" / "common-utils" / "python"
sys.path.insert(0, str(COMMON_UTILS))

from ff_utils.league_context import (  # noqa: E402
    LeagueConfigurationError,
    LeagueResolutionError,
    SleeperStateError,
    resolve_league_context,
    resolve_league_context_from_env,
)


SEED_ID = "1388309161581752320"
USER_ID = "475076051211382784"
LEAGUE_NAME = "Madtown's Finest"


class FakeResponse:
    def __init__(self, payload, status_error=None):
        self.payload = payload
        self.status_error = status_error

    def raise_for_status(self):
        if self.status_error:
            raise self.status_error

    def json(self):
        return self.payload


def state(season="2026"):
    return {
        "season": season,
        "week": 1,
        "display_week": 1,
        "season_type": "regular",
    }


def league(league_id=SEED_ID, season="2026", previous_league_id="previous-league"):
    return {
        "league_id": league_id,
        "previous_league_id": previous_league_id,
        "name": LEAGUE_NAME,
        "season": season,
        "sport": "nfl",
        "status": "in_season",
        "total_rosters": 10,
        "settings": {"playoff_week_start": 16, "playoff_teams": 4},
    }


class FakeSleeper:
    def __init__(self, responses):
        self.responses = responses
        self.calls = []

    def __call__(self, url, timeout):
        self.calls.append((url, timeout))
        response = self.responses.get(url)
        if isinstance(response, Exception):
            raise response
        if response is None:
            raise AssertionError(f"Unexpected request: {url}")
        return FakeResponse(response)


class LeagueContextTests(unittest.TestCase):
    def test_resolves_configured_seed_for_current_season(self):
        sleeper = FakeSleeper({
            "https://api.sleeper.app/v1/state/nfl": state(),
            f"https://api.sleeper.app/v1/user/{USER_ID}/leagues/nfl/2026": [league()],
        })

        context = resolve_league_context(USER_ID, LEAGUE_NAME, SEED_ID, sleeper)

        self.assertEqual(context["season"], "2026")
        self.assertEqual(context["week"], 1)
        self.assertEqual(context["league_id"], SEED_ID)
        self.assertEqual(context["league_name"], LEAGUE_NAME)
        self.assertEqual(context["settings"]["playoff_week_start"], 16)

    def test_resolves_future_renewal_through_seed_lineage(self):
        renewed_id = "future-league"
        previous_id = "intermediate-league"
        sleeper = FakeSleeper({
            "https://api.sleeper.app/v1/state/nfl": state("2028"),
            f"https://api.sleeper.app/v1/user/{USER_ID}/leagues/nfl/2028": [
                league(renewed_id, "2028", previous_id)
            ],
            f"https://api.sleeper.app/v1/league/{previous_id}": league(
                previous_id, "2027", SEED_ID
            ),
        })

        context = resolve_league_context(USER_ID, LEAGUE_NAME, SEED_ID, sleeper)

        self.assertEqual(context["season"], "2028")
        self.assertEqual(context["league_id"], renewed_id)

    def test_rejects_missing_league(self):
        sleeper = FakeSleeper({
            "https://api.sleeper.app/v1/state/nfl": state(),
            f"https://api.sleeper.app/v1/user/{USER_ID}/leagues/nfl/2026": [],
        })

        with self.assertRaisesRegex(LeagueResolutionError, "No NFL league"):
            resolve_league_context(USER_ID, LEAGUE_NAME, SEED_ID, sleeper)

    def test_rejects_ambiguous_leagues(self):
        sleeper = FakeSleeper({
            "https://api.sleeper.app/v1/state/nfl": state(),
            f"https://api.sleeper.app/v1/user/{USER_ID}/leagues/nfl/2026": [
                league(),
                league("duplicate", previous_league_id=SEED_ID),
            ],
        })

        with self.assertRaisesRegex(LeagueResolutionError, "Multiple leagues"):
            resolve_league_context(USER_ID, LEAGUE_NAME, SEED_ID, sleeper)

    def test_rejects_unrelated_same_name_league(self):
        unrelated_id = "unrelated"
        sleeper = FakeSleeper({
            "https://api.sleeper.app/v1/state/nfl": state(),
            f"https://api.sleeper.app/v1/user/{USER_ID}/leagues/nfl/2026": [
                league(unrelated_id, previous_league_id=None)
            ],
        })

        with self.assertRaisesRegex(LeagueResolutionError, "do not descend"):
            resolve_league_context(USER_ID, LEAGUE_NAME, SEED_ID, sleeper)

    def test_surfaces_state_fetch_failure(self):
        sleeper = FakeSleeper({
            "https://api.sleeper.app/v1/state/nfl": OSError("network unavailable")
        })

        with self.assertRaisesRegex(SleeperStateError, "network unavailable"):
            resolve_league_context(USER_ID, LEAGUE_NAME, SEED_ID, sleeper)

    def test_requires_all_environment_configuration(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(LeagueConfigurationError, "SLEEPER_LEAGUE_NAME"):
                resolve_league_context_from_env(lambda *_args, **_kwargs: None)


if __name__ == "__main__":
    unittest.main()
