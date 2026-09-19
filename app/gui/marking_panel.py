import tkinter as tk
from tkinter import ttk

from app.constants import DEFAULT_QUESTION_COUNT, OPTIONS


class MarkingPanel(ttk.LabelFrame):
    """Scrollable grid of question rows, each with A/B/C/D radio buttons.

    The question count can change after an answer key of a different length
    is registered, so the grid is rebuilt in place via `rebuild()` rather than
    fixed at construction time.
    """

    def __init__(self, master, total_questions=DEFAULT_QUESTION_COUNT, **kwargs):
        super().__init__(master, padding=(10, 10), **kwargs)
        self.total_questions = total_questions
        self.radio_vars = {}

        self._canvas = tk.Canvas(self)
        scrollbar = ttk.Scrollbar(self, orient="vertical", command=self._canvas.yview)
        self._scrollable_frame = ttk.Frame(self._canvas)

        self._scrollable_frame.bind(
            "<Configure>",
            lambda e: self._canvas.configure(scrollregion=self._canvas.bbox("all")),
        )
        self._canvas.create_window((0, 0), window=self._scrollable_frame, anchor="nw")
        self._canvas.configure(yscrollcommand=scrollbar.set)

        self._canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        self._populate(total_questions)

    def _populate(self, total_questions):
        self.configure(text=f" 2. 답안 마킹 (1~{total_questions}번) ")

        for child in self._scrollable_frame.winfo_children():
            child.destroy()

        self.total_questions = total_questions
        self.radio_vars = {}

        for q in range(1, total_questions + 1):
            col = (q - 1) // 25
            row = (q - 1) % 25

            q_frame = ttk.Frame(self._scrollable_frame)
            q_frame.grid(row=row, column=col, padx=10, pady=2, sticky="w")

            ttk.Label(q_frame, text=f"{q:03d}:", width=4).pack(side="left")

            var = tk.StringVar(value="")
            self.radio_vars[q] = var

            for opt in OPTIONS:
                ttk.Radiobutton(q_frame, text=opt, value=opt, variable=var).pack(side="left", padx=1)

    def rebuild(self, total_questions):
        """Resize the grid to a new question count, clearing any existing marks."""
        self._populate(total_questions)

    def get_answers(self):
        """Return ({question_no: answer}, [unmarked question numbers])."""
        answers = {}
        unmarked = []
        for q, var in self.radio_vars.items():
            ans = var.get()
            if not ans:
                unmarked.append(q)
            else:
                answers[q] = ans
        return answers, unmarked

    def reset(self):
        for var in self.radio_vars.values():
            var.set("")
