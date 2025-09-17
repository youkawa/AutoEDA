"""Application-level configuration helpers.

Secrets はリポジトリに含めず、`config/credentials.json` などのローカルファイルから
読み込む。テストや CI では `AUTOEDA_CREDENTIALS_FILE` でパスを明示的に指定する。
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict


class CredentialsError(RuntimeError):
    """Raised when required credentials are missing or invalid."""


_REPO_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_CREDENTIALS_PATH = _REPO_ROOT / "config" / "credentials.json"


def _resolve_credentials_path() -> Path:
    override = os.getenv("AUTOEDA_CREDENTIALS_FILE")
    if override:
        return Path(override)
    return _DEFAULT_CREDENTIALS_PATH


def _load_credentials() -> Dict[str, Any]:
    path = _resolve_credentials_path()
    if not path.exists():
        raise CredentialsError(f"credentials file not found: {path}")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:  # pragma: no cover - invalid JSON should fail fast
        raise CredentialsError(f"invalid JSON in credentials file: {exc}") from exc
    if not isinstance(data, dict):
        raise CredentialsError("credentials file must contain a JSON object")
    return data


@lru_cache(maxsize=1)
def get_openai_api_key() -> str:
    """Return the OpenAI API key configured for AutoEDA."""

    data = _load_credentials()
    llm_section = data.get("llm")
    if not isinstance(llm_section, dict):
        raise CredentialsError("llm section missing in credentials file")
    api_key = llm_section.get("openai_api_key")
    if not isinstance(api_key, str) or not api_key.strip():
        raise CredentialsError("openai_api_key is not configured")
    if api_key.strip().startswith("<"):
        raise CredentialsError("openai_api_key still contains placeholder value")
    return api_key.strip()


def _write_credentials(data: Dict[str, Any]) -> None:
    path = _resolve_credentials_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    try:  # pragma: no cover - permissions may fail on some OS
        os.chmod(path, 0o600)
    except PermissionError:
        pass
    reset_cache()


def set_openai_api_key(value: str) -> None:
    key = (value or "").strip()
    if not key:
        raise CredentialsError("openai_api_key cannot be empty")
    if key.startswith("<"):
        raise CredentialsError("openai_api_key still contains placeholder value")

    try:
        current = _load_credentials()
    except CredentialsError:
        current = {}

    llm_section = current.get("llm")
    if not isinstance(llm_section, dict):
        llm_section = {}
    llm_section["openai_api_key"] = key
    current["llm"] = llm_section

    _write_credentials(current)


def reset_cache() -> None:
    """Clear cached credentials (used by tests)."""

    get_openai_api_key.cache_clear()


__all__ = [
    "CredentialsError",
    "get_openai_api_key",
    "set_openai_api_key",
    "reset_cache",
]
