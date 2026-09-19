import tkinter as tk
from tkinter import messagebox, ttk

from app.grading import normalize_answer_string, validate_answer_string


class AnswerKeyPanel(ttk.LabelFrame):
    """Answer-key text entry plus preset save/load controls."""

    def __init__(self, master, *, on_register, on_save, on_load, saved_key_names, **kwargs):
        super().__init__(master, text=" 1. 정답지 관리 ", padding=(10, 10), **kwargs)
        self._on_register = on_register
        self._on_save = on_save
        self._on_load = on_load
        self._build(saved_key_names)

    def _build(self, saved_key_names):
        ttk.Label(
            self, text="정답을 연달아 입력하세요 (예: ABCDA...). 입력한 글자 수만큼 채점됩니다."
        ).pack(anchor="w")

        input_frame = ttk.Frame(self)
        input_frame.pack(fill="x", pady=5)

        self.entry_answer_string = ttk.Entry(input_frame)
        self.entry_answer_string.pack(side="left", fill="x", expand=True)

        ttk.Button(input_frame, text="정답 적용", command=self._handle_register).pack(
            side="right", padx=(5, 0)
        )

        saved_frame = ttk.Frame(self)
        saved_frame.pack(fill="x", pady=(5, 0))

        ttk.Label(saved_frame, text="저장된 정답지:").pack(side="left")

        self.combo_keys = ttk.Combobox(
            saved_frame, values=list(saved_key_names), state="readonly", width=20
        )
        self.combo_keys.pack(side="left", padx=5)

        ttk.Button(saved_frame, text="불러오기", command=self._handle_load).pack(side="left", padx=2)
        ttk.Button(saved_frame, text="현재 정답지 이름 붙여 저장", command=self._handle_save).pack(
            side="right"
        )

    def get_raw_answer(self):
        return normalize_answer_string(self.entry_answer_string.get())

    def set_raw_answer(self, raw_ans):
        self.entry_answer_string.delete(0, tk.END)
        self.entry_answer_string.insert(0, raw_ans)

    def set_saved_key_names(self, names):
        self.combo_keys["values"] = list(names)

    def select_saved_key(self, name):
        self.combo_keys.set(name)

    def _handle_register(self):
        self._on_register(self.get_raw_answer())

    def _handle_save(self):
        raw_ans = self.get_raw_answer()
        error = validate_answer_string(raw_ans)
        if error:
            messagebox.showwarning("오류", error)
            return
        self._on_save(raw_ans)

    def _handle_load(self):
        selected_name = self.combo_keys.get()
        if not selected_name:
            messagebox.showwarning("오류", "불러올 정답지를 선택해주세요.")
            return
        self._on_load(selected_name)
