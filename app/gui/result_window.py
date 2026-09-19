import datetime
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from app.grading import build_result_text


class ResultWindow(tk.Toplevel):
    """Popup showing the score and a wrong-answer note editor, with save-to-file."""

    def __init__(self, master, *, total_questions, correct_count, user_answers, answer_key, wrong_questions):
        super().__init__(master)
        self.title("채점 결과 및 오답 노트")
        self.geometry("550x650")

        self.total_questions = total_questions
        self.correct_count = correct_count
        self.user_answers = user_answers
        self.answer_key = answer_key
        self.wrong_questions = wrong_questions
        self.note_entries = {}

        self._build()

    def _build(self):
        accuracy = (self.correct_count / self.total_questions) * 100
        ttk.Label(
            self,
            text=f"맞은 개수: {self.correct_count} / {self.total_questions} ({accuracy:.1f}%)",
            font=("맑은 고딕", 12, "bold"),
        ).pack(pady=10)

        note_frame = ttk.Frame(self)
        note_frame.pack(fill="both", expand=True, padx=15, pady=5)

        canvas = tk.Canvas(note_frame)
        scrollbar = ttk.Scrollbar(note_frame, orient="vertical", command=canvas.yview)
        scrollable_notes = ttk.Frame(canvas)

        scrollable_notes.bind(
            "<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )
        canvas.create_window((0, 0), window=scrollable_notes, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)

        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        if self.wrong_questions:
            for q in self.wrong_questions:
                row = ttk.Frame(scrollable_notes)
                row.pack(fill="x", pady=3, expand=True)

                lbl_info = f"[{q:03d}번] 제출: {self.user_answers[q]} | 정답: {self.answer_key[q]}"
                ttk.Label(row, text=lbl_info, width=28).pack(side="left", anchor="w")

                entry_reason = ttk.Entry(row)
                entry_reason.pack(side="left", fill="x", expand=True, padx=5)
                self.note_entries[q] = entry_reason
        else:
            ttk.Label(scrollable_notes, text="만점입니다! 오답이 없습니다.").pack(pady=20)

        ttk.Button(
            self, text="파일 위치 선택 및 결과 저장하기", command=self._save_to_txt_with_dialog
        ).pack(fill="x", padx=15, pady=10, ipady=5)

    def _save_to_txt_with_dialog(self):
        default_name = f"toeic_result_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"

        filepath = filedialog.asksaveasfilename(
            parent=self,
            title="결과 파일 저장 위치 선택",
            initialfile=default_name,
            defaultextension=".txt",
            filetypes=[("Text Files", "*.txt"), ("All Files", "*.*")],
        )
        if not filepath:
            return

        notes = {q: entry.get() for q, entry in self.note_entries.items()}
        text = build_result_text(
            timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            correct_count=self.correct_count,
            total=self.total_questions,
            user_answers=self.user_answers,
            answer_key=self.answer_key,
            wrong_questions=self.wrong_questions,
            notes=notes,
        )

        try:
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(text)
            messagebox.showinfo("저장 완료", f"결과가 성공적으로 저장되었습니다:\n{filepath}")
            self.destroy()
        except Exception as e:
            messagebox.showerror("저장 실패", f"파일 저장 중 오류가 발생했습니다:\n{e}")
