import tkinter as tk
from tkinter import messagebox, ttk

from app.constants import DEFAULT_QUESTION_COUNT
from app.gui.answer_key_panel import AnswerKeyPanel
from app.gui.marking_panel import MarkingPanel
from app.gui.result_window import ResultWindow
from app.grading import grade, parse_answer_key, validate_answer_string
from app.storage import load_saved_keys, save_key_preset


class ToeicGraderApp:
    """Top-level window: wires the answer-key panel, marking panel, and result popup together."""

    def __init__(self, root):
        self.root = root
        self.root.title("토익 답안지 채점 및 오답노트 프로그램")
        self.root.geometry("620x800")

        self.total_questions = DEFAULT_QUESTION_COUNT
        self.answer_key = {}
        self.saved_keys = load_saved_keys()

        self._build()

    def _build(self):
        self.answer_key_panel = AnswerKeyPanel(
            self.root,
            on_register=self._register_answer_key,
            on_save=self._open_save_dialog,
            on_load=self._load_selected_key,
            saved_key_names=self.saved_keys.keys(),
        )
        self.answer_key_panel.pack(fill="x", padx=10, pady=5)

        self.marking_panel = MarkingPanel(self.root, total_questions=self.total_questions)
        self.marking_panel.pack(fill="both", expand=True, padx=10, pady=5)

        bottom_frame = ttk.Frame(self.root)
        bottom_frame.pack(fill="x", padx=10, pady=10)

        ttk.Button(bottom_frame, text="마킹 초기화", command=self._reset_marking).pack(
            side="left", fill="x", expand=True, padx=(0, 5), ipady=5
        )
        ttk.Button(bottom_frame, text="채점하기", command=self._grade_answers).pack(
            side="right", fill="x", expand=True, padx=(5, 0), ipady=5
        )

    def _register_answer_key(self, raw_ans):
        error = validate_answer_string(raw_ans)
        if error:
            messagebox.showwarning("입력 오류", error)
            return
        self.answer_key = parse_answer_key(raw_ans)
        self.total_questions = len(raw_ans)
        self.marking_panel.rebuild(self.total_questions)
        messagebox.showinfo("성공", f"정답지가 적용되었습니다. (총 {self.total_questions}문항)")

    def _open_save_dialog(self, raw_ans):
        title_win = tk.Toplevel(self.root)
        title_win.title("정답지 이름 저장")
        title_win.geometry("300x120")

        ttk.Label(title_win, text="저장할 정답지 이름 (예: 1,000회차 LC):").pack(pady=5)
        entry_title = ttk.Entry(title_win)
        entry_title.pack(fill="x", padx=15, pady=5)

        def save():
            name = entry_title.get().strip()
            if not name:
                messagebox.showwarning("오류", "이름을 입력해주세요.")
                return
            self.saved_keys = save_key_preset(self.saved_keys, name, raw_ans)
            self.answer_key_panel.set_saved_key_names(self.saved_keys.keys())
            self.answer_key_panel.select_saved_key(name)
            messagebox.showinfo("완료", f"'{name}' 정답지가 저장되었습니다.")
            title_win.destroy()

        ttk.Button(title_win, text="저장", command=save).pack(pady=5)

    def _load_selected_key(self, name):
        raw_ans = self.saved_keys[name]
        self.answer_key_panel.set_raw_answer(raw_ans)
        self._register_answer_key(raw_ans)

    def _reset_marking(self):
        if messagebox.askyesno("초기화", "마킹한 모든 답안을 지우시겠습니까?"):
            self.marking_panel.reset()

    def _grade_answers(self):
        if not self.answer_key:
            messagebox.showwarning("경고", "상단에서 정답을 먼저 적용해주세요.")
            return

        user_answers, unmarked = self.marking_panel.get_answers()
        if unmarked:
            messagebox.showwarning(
                "마킹 미완료",
                f"안 푼 문항이 있습니다: {unmarked[:5]}... (총 {len(unmarked)}개)",
            )
            return

        correct_count, wrong_questions = grade(user_answers, self.answer_key, self.total_questions)

        ResultWindow(
            self.root,
            total_questions=self.total_questions,
            correct_count=correct_count,
            user_answers=user_answers,
            answer_key=self.answer_key,
            wrong_questions=wrong_questions,
        )
