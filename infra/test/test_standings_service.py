import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock


# The deployed runtime supplies these dependencies. The cache-forwarding unit test
# does not use them, so lightweight modules keep the local test dependency-free.
sys.modules.setdefault("boto3", types.ModuleType("boto3"))
sys.modules.setdefault("requests", types.ModuleType("requests"))

STANDINGS_SOURCE = (
    Path(__file__).parents[2] / "packages" / "ff-standings" / "src"
)
sys.path.insert(0, str(STANDINGS_SOURCE))

from ff_standings.service import StandingsService  # noqa: E402


class StandingsServiceCacheTests(unittest.TestCase):
    def test_polling_startup_forwards_resolved_context_to_cache(self):
        service = StandingsService.__new__(StandingsService)
        service.enable_persistent_cache = True
        service.data_cache = Mock()

        service.load_cache("1388309161581752320", "2026")

        service.data_cache.load_all_cache.assert_called_once_with(
            "1388309161581752320",
            "2026",
        )

    def test_disabled_persistent_cache_does_not_load(self):
        service = StandingsService.__new__(StandingsService)
        service.enable_persistent_cache = False
        service.data_cache = Mock()

        service.load_cache("1388309161581752320", "2026")

        service.data_cache.load_all_cache.assert_not_called()


if __name__ == "__main__":
    unittest.main()
