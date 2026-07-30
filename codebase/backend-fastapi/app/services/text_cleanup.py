import re
from typing import Any


def strip_markdown_text(value: Any) -> str:
    text = str(value or "").replace("\r\n", "\n").replace("\r", "\n")
    if not text.strip():
        return ""

    text = re.sub(r"```(?:[a-zA-Z0-9_-]+)?\s*", "", text)
    text = text.replace("```", "")
    text = re.sub(r"!\[([^\]]*)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"(?m)^\s{0,3}#{1,6}\s+", "", text)
    text = re.sub(r"(?m)^\s{0,3}>\s?", "", text)
    text = re.sub(r"(?m)^\s{0,3}(?:[-*+]\s+|\d+[.)]\s+)", "", text)
    text = re.sub(r"(?m)^\s{0,3}[-*_]{3,}\s*$", "", text)

    emphasis_patterns = [
        r"\*\*\*(.+?)\*\*\*",
        r"___(.+?)___",
        r"\*\*(.+?)\*\*",
        r"__(.+?)__",
        r"(?<!\w)\*(?!\s)(.+?)(?<!\s)\*(?!\w)",
        r"(?<!\w)_(?!\s)(.+?)(?<!\s)_(?!\w)",
    ]
    previous = None
    while previous != text:
        previous = text
        for pattern in emphasis_patterns:
            text = re.sub(pattern, r"\1", text, flags=re.S)

    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"\\([\\`*_{}\[\]()#+\-.!>])", r"\1", text)
    text = re.sub(r"[ \t]*\n[ \t]*", " ", text)
    return re.sub(r"\s+", " ", text).strip()
