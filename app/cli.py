"""Terminal-based front end, used when tkinter or a display is unavailable.

Reuses the same grading/storage logic as the GUI (app.grading, app.storage),
so both front ends stay in sync with a single source of truth for behavior.
"""

import datetime

from app.grading import build_result_text, grade, parse_answer_key, validate_answer_string
from app.storage import load_saved_keys, save_key_preset


def _prompt_answer_string(prompt, total=None):
    while True:
        raw = input(prompt).strip().upper().replace(" ", "")
        error = validate_answer_string(raw, total)
        if error is None:
            return raw
        print(f"  [오류] {error}")


def _choose_answer_key(saved_keys):
    """Prompt for (or load) an answer key. Its length becomes the question count."""
    if saved_keys:
        print("\n저장된 정답지:")
        names = list(saved_keys.keys())
        for i, name in enumerate(names, start=1):
            print(f"  {i}. {name}")
        choice = input(
            "불러올 정답지 번호를 입력하거나, 새로 입력하려면 Enter를 누르세요: "
        ).strip()
        if choice:
            try:
                idx = int(choice) - 1
                if 0 <= idx < len(names):
                    name = names[idx]
                    return parse_answer_key(saved_keys[name])
            except ValueError:
                pass
            print("  [오류] 잘못된 번호입니다. 새로 입력합니다.")

    raw_ans = _prompt_answer_string(
        "정답을 연달아 입력하세요 (예: ABCDA...). 입력한 글자 수만큼 채점됩니다: "
    )

    if input("이 정답지를 이름 붙여 저장할까요? (y/N): ").strip().lower() == "y":
        name = input("저장할 이름: ").strip()
        if name:
            save_key_preset(saved_keys, name, raw_ans)
            print(f"  '{name}' 정답지가 저장되었습니다.")

    return parse_answer_key(raw_ans)


def _collect_notes(wrong_questions, user_answers, answer_key):
    notes = {}
    if not wrong_questions:
        return notes

    if input(
        "\n틀린 문제마다 이유를 메모하시겠습니까? (y/N, N이면 모두 건너뜁니다): "
    ).strip().lower() != "y":
        return notes

    for q in wrong_questions:
        prompt = f"  [{q:03d}번] 제출: {user_answers[q]} | 정답: {answer_key[q]} - 오답 이유: "
        notes[q] = input(prompt).strip()
    return notes


def run_cli():
    print("=========================================")
    print("   토익 답안지 채점 및 오답노트 프로그램 (CLI)   ")
    print("=========================================")

    saved_keys = load_saved_keys()
    answer_key = _choose_answer_key(saved_keys)
    total = len(answer_key)

    user_ans_raw = _prompt_answer_string(
        f"\n제출한 답안 {total}개를 연달아 입력하세요 (예: ABCDA...): ", total
    )
    user_answers = parse_answer_key(user_ans_raw)

    correct_count, wrong_questions = grade(user_answers, answer_key, total)
    accuracy = (correct_count / total) * 100
    print(f"\n맞은 개수: {correct_count} / {total} ({accuracy:.1f}%)")

    if wrong_questions:
        print(f"틀린 문항 ({len(wrong_questions)}개): {wrong_questions}")
    else:
        print("만점입니다! 오답이 없습니다.")

    notes = _collect_notes(wrong_questions, user_answers, answer_key)

    if input("\n결과를 텍스트 파일로 저장할까요? (Y/n): ").strip().lower() != "n":
        default_name = f"toeic_result_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        filepath = input(f"저장할 파일 경로 [{default_name}]: ").strip() or default_name

        text = build_result_text(
            timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            correct_count=correct_count,
            total=total,
            user_answers=user_answers,
            answer_key=answer_key,
            wrong_questions=wrong_questions,
            notes=notes,
        )
        try:
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(text)
            print(f"결과가 저장되었습니다: {filepath}")
        except OSError as e:
            print(f"[오류] 파일 저장 중 문제가 발생했습니다: {e}")


if __name__ == "__main__":
    run_cli()
