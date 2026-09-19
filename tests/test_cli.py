import io
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import cli


class RunCliTest(unittest.TestCase):
    @patch("app.cli.save_key_preset")
    @patch("app.cli.load_saved_keys", return_value={})
    def test_perfect_score_no_presets(self, mock_load, mock_save):
        inputs = iter(
            [
                "A" * 100,  # answer key
                "n",  # don't save preset
                "A" * 100,  # user answers (all correct)
                "n",  # don't save result file
            ]
        )

        buf = io.StringIO()
        with patch("builtins.input", lambda *_: next(inputs)), patch("sys.stdout", buf):
            cli.run_cli()

        self.assertIn("100 / 100", buf.getvalue())
        mock_save.assert_not_called()

    @patch("app.cli.save_key_preset")
    @patch("app.cli.load_saved_keys", return_value={})
    def test_wrong_answer_collects_note(self, mock_load, mock_save):
        inputs = iter(
            [
                "A" * 100,  # answer key
                "n",  # don't save preset
                "B" + "A" * 99,  # user answers, Q1 wrong
                "y",  # yes, take notes
                "헷갈렸음",  # note for Q1
                "n",  # don't save result file
            ]
        )

        buf = io.StringIO()
        with patch("builtins.input", lambda *_: next(inputs)), patch("sys.stdout", buf):
            cli.run_cli()

        output = buf.getvalue()
        self.assertIn("99 / 100", output)
        self.assertIn("[1]", output)

    @patch("app.cli.save_key_preset")
    @patch("app.cli.load_saved_keys", return_value={})
    def test_grades_using_answer_key_length_not_fixed_100(self, mock_load, mock_save):
        inputs = iter(
            [
                "ABCD",  # 4-question answer key
                "n",  # don't save preset
                "ABCD",  # user answers, all correct
                "n",  # don't save result file
            ]
        )

        buf = io.StringIO()
        with patch("builtins.input", lambda *_: next(inputs)), patch("sys.stdout", buf):
            cli.run_cli()

        self.assertIn("4 / 4", buf.getvalue())


if __name__ == "__main__":
    unittest.main()
