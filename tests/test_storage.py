import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.storage import load_saved_keys, save_key_preset


class StorageTest(unittest.TestCase):
    def test_load_missing_file_returns_empty_dict(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "missing.json"
            self.assertEqual(load_saved_keys(str(path)), {})

    def test_save_then_load_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "keys.json"
            saved = save_key_preset({}, "1000회 LC", "A" * 100, str(path))
            self.assertEqual(saved["1000회 LC"], "A" * 100)

            loaded = load_saved_keys(str(path))
            self.assertEqual(loaded["1000회 LC"], "A" * 100)

    def test_load_corrupted_file_returns_empty_dict(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bad.json"
            path.write_text("not json", encoding="utf-8")
            self.assertEqual(load_saved_keys(str(path)), {})

    def test_save_preserves_existing_entries(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "keys.json"
            saved = {"old": "B" * 100}
            save_key_preset(saved, "new", "C" * 100, str(path))
            loaded = load_saved_keys(str(path))
            self.assertEqual(set(loaded.keys()), {"old", "new"})


if __name__ == "__main__":
    unittest.main()
