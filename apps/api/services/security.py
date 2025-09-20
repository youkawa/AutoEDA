from __future__ import annotations

import re
from typing import Optional

_EMAIL = re.compile(r"\b([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+)\.[A-Za-z]{2,}\b")
_BEARER = re.compile(r"(?i)\bBearer\s+([A-Za-z0-9._\-]+)\b")
_JWT = re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b")
_BASIC = re.compile(r"(?i)\bAuthorization\s*:\s*Basic\s+([A-Za-z0-9+/=]+)\b")
_API_KEY_FIELD = re.compile(r"(?i)(api[_-]?key|token|secret|client[_-]?secret)\s*[:=]\s*([\"']?)([^\"'\s]{6,})(\2)")
_URL_KEY_PARAM = re.compile(r"(?i)([?&](?:api[_-]?key|token|secret|password|client[_-]?secret)\=)([^&#]{4,})")
_URL_USERINFO = re.compile(r"(?i)\b(https?:\/\/)([^:@\s]+):([^@\s]+)@")
_LONG_ALNUM = re.compile(r"\b([A-Za-z0-9_-]{24,})\b")
_UUID = re.compile(r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\b")
_AWS_AKID = re.compile(r"\bAKIA[0-9A-Z]{16}\b")
_PHONE = re.compile(r"(?<!\d)(\+?\d[\d\s\-]{7,}\d)(?!\d)")


def redact(text: str, *, max_len: int = 500) -> str:
    """Best-effort redaction for logs. Removes common secrets/PII.

    - Emails: user@domain.tld -> ***@***
    - Bearer tokens: Bearer ***
    - api_key/token/secret fields: value -> ***
    - URL query params api_key/token/secret -> masked
    - Long opaque tokens (24+ chars) -> masked
    - Phone numbers -> masked
    """
    if not text:
        return ""
    s = text
    s = _EMAIL.sub("***@***", s)
    s = _BEARER.sub("Bearer ***", s)
    s = _JWT.sub("***", s)
    s = _BASIC.sub("Authorization: Basic ***", s)
    s = _API_KEY_FIELD.sub(lambda m: f"{m.group(1)}={m.group(2)}***{m.group(4)}", s)
    s = _URL_KEY_PARAM.sub(lambda m: f"{m.group(1)}***", s)
    s = _URL_USERINFO.sub(lambda m: f"{m.group(1)}***:***@", s)
    s = _LONG_ALNUM.sub("***", s)
    s = _UUID.sub("***", s)
    s = _AWS_AKID.sub("***", s)
    s = _PHONE.sub("***", s)
    if max_len and len(s) > max_len:
        s = s[: max_len - 3] + "..."
    return s


def summarize_logs(text: Optional[str], *, max_lines: int = 6, max_chars: int = 500) -> str:
    """Produce a short, redacted summary of stderr/stdout for safe UI display.

    - Applies redact() first
    - Keeps only the first `max_lines` lines (joined with \n)
    - If a Python Traceback is detected, tries to include the final error line
    - Trims to `max_chars`
    """
    if not text:
        return ""
    s = redact(str(text), max_len=max_chars * 2)  # redact before slicing
    lines = s.splitlines()
    # Try to capture final exception line from a traceback
    if any(l.startswith("Traceback ") for l in lines):
        for i in range(len(lines) - 1, -1, -1):
            if lines[i].strip():
                last = lines[i].strip()
                # Prepend final exception line if not already in the head
                if last not in lines[:max_lines]:
                    lines = (lines[: max_lines - 1]) + [last]
                break
    head = lines[:max_lines]
    out = "\n".join(head)
    if len(out) > max_chars:
        out = out[: max_chars - 3] + "..."
    return out
