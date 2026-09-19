import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.grading import (
    build_result_text,
    grade,
    normalize_answer_string,
    parse_answer_key,
    validate_answer_string,
)


class NormalizeAnswerStringTest(unittest.TestCase):
    def test_strips_and_uppercases(self):
        self.assertEqual(normalize_answer_string(" abcd "), "ABCD")

    def test_removes_internal_spaces(self):
        self.assertEqual(normalize_answer_string("AB CD"), "ABCD")


class ValidateAnswerStringTest(unittest.TestCase):
    def test_valid_length_and_chars(self):
        self.assertIsNone(validate_answer_string("A" * 100, total=100))

    def test_wrong_length(self):
        error = validate_answer_string("ABC", total=100)
        self.assertIn("100", error)

    def test_invalid_character(self):
        raw = "A" * 99 + "E"
        error = validate_answer_string(raw, total=100)
        self.assertIn("E", error)

    def test_no_total_accepts_any_nonempty_valid_length(self):
        self.assertIsNone(validate_answer_string("ABCD"))
        self.assertIsNone(validate_answer_string("A" * 37))

    def test_no_total_still_rejects_invalid_character(self):
        error = validate_answer_string("ABCE")
        self.assertIn("E", error)

    def test_empty_string_rejected(self):
        self.assertIsNotNone(validate_answer_string(""))


class ParseAnswerKeyTest(unittest.TestCase):
    def test_maps_1_indexed_questions(self):
        self.assertEqual(parse_answer_key("ABCD"), {1: "A", 2: "B", 3: "C", 4: "D"})


class GradeTest(unittest.TestCase):
    def test_all_correct(self):
        answer_key = {1: "A", 2: "B", 3: "C"}
        user_answers = {1: "A", 2: "B", 3: "C"}
        correct, wrong = grade(user_answers, answer_key, total=3)
        self.assertEqual(correct, 3)
        self.assertEqual(wrong, [])

    def test_some_wrong(self):
        answer_key = {1: "A", 2: "B", 3: "C"}
        user_answers = {1: "A", 2: "D", 3: "D"}
        correct, wrong = grade(user_answers, answer_key, total=3)
        self.assertEqual(correct, 1)
        self.assertEqual(wrong, [2, 3])

    def test_infers_total_from_answer_key_length_when_omitted(self):
        answer_key = {1: "A", 2: "B"}
        user_answers = {1: "A", 2: "A"}
        correct, wrong = grade(user_answers, answer_key)
        self.assertEqual(correct, 1)
        self.assertEqual(wrong, [2])


class BuildResultTextTest(unittest.TestCase):
    def test_contains_score_and_wrong_notes(self):
        text = build_result_text(
            timestamp="2026-09-19 12:00:00",
            correct_count=2,
            total=3,
            user_answers={1: "A", 2: "D", 3: "C"},
            answer_key={1: "A", 2: "B", 3: "C"},
            wrong_questions=[2],
            notes={2: "헷갈렸음"},
        )
        self.assertIn("점수: 2 / 3", text)
        self.assertIn("002번", text)
        self.assertIn("헷갈렸음", text)

    def test_missing_note_defaults_to_placeholder(self):
        text = build_result_text(
            timestamp="2026-09-19 12:00:00",
            correct_count=0,
            total=1,
            user_answers={1: "B"},
            answer_key={1: "A"},
            wrong_questions=[1],
            notes={},
        )
        self.assertIn("메모 없음", text)

    def test_perfect_score_note(self):
        text = build_result_text(
            timestamp="2026-09-19 12:00:00",
            correct_count=1,
            total=1,
            user_answers={1: "A"},
            answer_key={1: "A"},
            wrong_questions=[],
            notes={},
        )
        self.assertIn("틀린 문제가 없습니다.", text)


if __name__ == "__main__":
    unittest.main()
