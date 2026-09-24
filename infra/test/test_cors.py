import sys
import unittest
from pathlib import Path


COMMON_UTILS = Path(__file__).parents[1] / "layers" / "common-utils" / "python"
sys.path.insert(0, str(COMMON_UTILS))

from ff_utils.dynamodb import get_cors_headers  # noqa: E402


class CorsHeadersTests(unittest.TestCase):
    def test_allows_local_development_production_and_assigned_domains(self):
        for origin in (
            "http://localhost:5173",
            "https://madtownsfinest.app",
            "https://ff-app-vert.vercel.app",
            "https://ff-app-mikes-projects-e5f6e59b.vercel.app",
        ):
            headers = get_cors_headers(origin)
            self.assertEqual(headers["Access-Control-Allow-Origin"], origin)
            self.assertEqual(headers["Vary"], "Origin")

    def test_allows_changing_deployment_domains_for_the_vercel_project(self):
        origin = "https://ff-pr9g97tcu-mikes-projects-e5f6e59b.vercel.app"
        self.assertEqual(
            get_cors_headers(origin)["Access-Control-Allow-Origin"], origin
        )

    def test_rejects_unrelated_or_lookalike_origins(self):
        for origin in (
            "https://unrelated.vercel.app",
            "https://ff-preview-other-team.vercel.app",
            "https://ff-preview-mikes-projects-e5f6e59b.vercel.app.evil.example",
            "http://madtownsfinest.app",
            "http://localhost:5174",
            None,
        ):
            self.assertNotIn("Access-Control-Allow-Origin", get_cors_headers(origin))


if __name__ == "__main__":
    unittest.main()
