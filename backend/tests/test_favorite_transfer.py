import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from core import favorites as favorites_module
from models.schemas import FavoriteExportDocument, FavoriteExportItem


class FavoriteTransferTests(unittest.TestCase):
    def make_manager(self, temp_dir: Path) -> favorites_module.FavoriteManager:
        self.bookmarks_patch = patch.object(favorites_module, "BOOKMARKS_FILE", temp_dir / "favorites.json")
        self.groups_patch = patch.object(favorites_module, "FAVORITE_GROUPS_FILE", temp_dir / "favorite_groups.json")
        self.bookmarks_patch.start()
        self.groups_patch.start()
        self.addCleanup(self.bookmarks_patch.stop)
        self.addCleanup(self.groups_patch.stop)
        return favorites_module.FavoriteManager()

    def test_export_can_limit_to_selected_groups(self) -> None:
        with tempfile.TemporaryDirectory() as path:
            manager = self.make_manager(Path(path))
            manager.add_group("Work")
            manager.add("Office", 25.0, 121.0, "Work", "weekday")
            manager.add("Home", 25.1, 121.1, "", "evening")

            document = manager.export_document(["Work"])

        self.assertEqual(document.format, "arcwayfarer-favorites")
        self.assertEqual(document.schema_version, 1)
        self.assertEqual(document.groups, ["Work"])
        self.assertEqual([favorite.name for favorite in document.favorites], ["Office"])
        self.assertNotIn("id", document.favorites[0].model_dump())

    def test_import_skips_nearby_existing_and_duplicate_imported_points(self) -> None:
        with tempfile.TemporaryDirectory() as path:
            temporary_path = Path(path)
            manager = self.make_manager(temporary_path)
            manager.add("Existing", 25.033000, 121.565400, "Local", "keep this")
            document = FavoriteExportDocument(
                exported_at="2026-08-20T00:00:00Z",
                groups=["Travel", "Local"],
                favorites=[
                    # About 1.1m from Existing, so it must not make a second point.
                    FavoriteExportItem(name="Imported duplicate", lat=25.033010, lng=121.565400, group="Travel", notes="skip", created_at=1, order=0),
                    FavoriteExportItem(name="Airport", lat=25.079700, lng=121.234200, group="Travel", notes="terminal", created_at=2, order=1),
                    # Same imported point with tiny precision difference; also skipped.
                    FavoriteExportItem(name="Airport copy", lat=25.079710, lng=121.234200, group="Travel", notes="skip", created_at=3, order=2),
                ],
            )

            preview = manager.preview_import(document)
            result = manager.import_document(document)
            favorites = manager.list()
            groups = manager.list_groups()
            stored = json.loads((temporary_path / "favorites.json").read_text())

        self.assertEqual((preview.total, preview.additions, preview.duplicates), (3, 1, 2))
        self.assertEqual(preview.groups_to_add, ["Travel"])
        self.assertEqual((result.imported, result.duplicates), (1, 2))
        self.assertEqual([(favorite.name, favorite.group, favorite.notes) for favorite in favorites], [
            ("Existing", "Local", "keep this"),
            ("Airport", "Travel", "terminal"),
        ])
        self.assertEqual(groups, ["Local", "Travel"])
        self.assertEqual(len(stored), 2)
        self.assertTrue(stored[1]["id"])


if __name__ == "__main__":
    unittest.main()
