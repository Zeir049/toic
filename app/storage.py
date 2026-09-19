"""JSON-backed persistence for named answer-key presets."""

import json
import os

from app.constants import ANSWER_FILE


def load_saved_keys(path=ANSWER_FILE):
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_key_preset(saved_keys, name, raw_ans, path=ANSWER_FILE):
    """Add/overwrite a preset in saved_keys and persist to disk. Returns saved_keys."""
    saved_keys[name] = raw_ans
    with open(path, "w", encoding="utf-8") as f:
        json.dump(saved_keys, f, ensure_ascii=False, indent=2)
    return saved_keys
