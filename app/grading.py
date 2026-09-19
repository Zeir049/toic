"""Pure grading/validation logic. No tkinter dependency, easy to unit test."""

from app.constants import OPTIONS


def normalize_answer_string(raw_ans):
    return raw_ans.strip().upper().replace(" ", "")


def validate_answer_string(raw_ans, total=None):
    """Return None if raw_ans is a valid answer string, else an error message.

    When `total` is given, raw_ans must be exactly that many characters (used
    to check submitted answers against an already-registered key's length).
    When omitted, any non-empty string of valid option characters is
    accepted — the key's own length becomes the question count to grade.
    """
    if not raw_ans:
        return "정답을 입력해주세요."
    if total is not None and len(raw_ans) != total:
        return f"정답은 정확히 {total}자여야 합니다. (현재: {len(raw_ans)}자)"
    for char in raw_ans:
        if char not in OPTIONS:
            return f"유효하지 않은 문자: '{char}'"
    return None


def parse_answer_key(raw_ans):
    """Convert a validated answer string into a {question_no: answer} dict (1-indexed)."""
    return {i + 1: char for i, char in enumerate(raw_ans)}


def grade(user_answers, answer_key, total=None):
    """Return (correct_count, wrong_questions) comparing question numbers 1..total.

    `total` defaults to the number of questions in `answer_key`.
    """
    if total is None:
        total = len(answer_key)

    correct_count = 0
    wrong_questions = []
    for q in range(1, total + 1):
        if user_answers[q] == answer_key[q]:
            correct_count += 1
        else:
            wrong_questions.append(q)
    return correct_count, wrong_questions


def build_result_text(
    *, timestamp, correct_count, total, user_answers, answer_key, wrong_questions, notes
):
    """Build the plain-text report content written to the result .txt file."""
    accuracy = (correct_count / total) * 100
    lines = [
        "=========================================",
        "           토익 채점 및 오답 노트          ",
        "=========================================",
        f"일시: {timestamp}",
        f"점수: {correct_count} / {total} ({accuracy:.1f}%)",
        "",
        "[ 전체 답안 현황 ]",
    ]

    for i in range(1, total + 1):
        is_correct = "O" if user_answers[i] == answer_key[i] else "X"
        lines.append(f"{i:03d}번 | 제출: {user_answers[i]} | 정답: {answer_key[i]} | [{is_correct}]")

    lines.append("")
    lines.append("[ 오답 노트 ]")
    if wrong_questions:
        for q in wrong_questions:
            reason = notes.get(q, "").strip() or "메모 없음"
            lines.append(f"- {q:03d}번 (제출: {user_answers[q]} / 정답: {answer_key[q]})")
            lines.append(f"  이유: {reason}")
    else:
        lines.append("틀린 문제가 없습니다.")

    return "\n".join(lines) + "\n"
