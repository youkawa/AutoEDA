"""Application-level configuration helpers for LLM credentials."""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Optional

SUPPORTED_PROVIDERS = {"openai", "gemini"}
_DEFAULT_PROVIDER = os.getenv("AUTOEDA_DEFAULT_LLM_PROVIDER", "openai").lower()


class CredentialsError(RuntimeError):
    """Raised when required credentials are missing or invalid."""


_REPO_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_CREDENTIALS_PATH = _REPO_ROOT / "config" / "credentials.json"


def _resolve_credentials_path() -> Path:
    override = os.getenv("AUTOEDA_CREDENTIALS_FILE")
    if override:
        return Path(override)
    return _DEFAULT_CREDENTIALS_PATH


def _load_credentials_raw() -> Dict[str, Any]:
    path = _resolve_credentials_path()
    if not path.exists():
        raise CredentialsError(f"credentials file not found: {path}")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:  # pragma: no cover
        raise CredentialsError(f"invalid JSON in credentials file: {exc}") from exc
    if not isinstance(data, dict):
        raise CredentialsError("credentials file must contain a JSON object")
    return data


def _load_credentials_optional() -> Dict[str, Any]:
    try:
        return _load_credentials_raw()
    except CredentialsError:
        return {}


def _write_credentials(data: Dict[str, Any]) -> None:
    path = _resolve_credentials_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    try:  # pragma: no cover - permissions may fail on some OS
        os.chmod(path, 0o600)
    except PermissionError:
        pass
    reset_cache()


def _normalise_llm_section(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        return {}
    section = dict(raw)

    # Migrate legacy keys where api key was stored at top-level (openai only)
    if "openai_api_key" in section and "openai" not in section:
        section["openai"] = {"api_key": section.pop("openai_api_key")}
    if "gemini_api_key" in section and "gemini" not in section:
        section["gemini"] = {"api_key": section.pop("gemini_api_key")}

    return section


def _save_llm_section(section: Dict[str, Any]) -> None:
    data = _load_credentials_optional()
    data["llm"] = section
    _write_credentials(data)


@lru_cache(maxsize=1)
def get_llm_provider() -> str:
    section = _normalise_llm_section(_load_credentials_optional().get("llm"))
    provider = str(section.get("provider") or "").lower()
    if provider in SUPPORTED_PROVIDERS:
        return provider
    # Fallback heuristics based on available keys
    if _provider_has_key(section, "openai"):
        return "openai"
    if _provider_has_key(section, "gemini"):
        return "gemini"
    return _DEFAULT_PROVIDER if _DEFAULT_PROVIDER in SUPPORTED_PROVIDERS else "openai"


def _provider_has_key(section: Dict[str, Any], provider: str) -> bool:
    node = section.get(provider)
    if isinstance(node, dict):
        key = node.get("api_key")
        return isinstance(key, str) and bool(key.strip()) and not key.strip().startswith("<")
    return False


@lru_cache(maxsize=1)
def get_openai_api_key() -> str:
    section = _normalise_llm_section(_load_credentials_raw().get("llm"))
    api_key: Optional[str] = None
    if "openai" in section and isinstance(section["openai"], dict):
        api_key = section["openai"].get("api_key")
    if not api_key:
        api_key = section.get("openai_api_key")
    if not isinstance(api_key, str) or not api_key.strip():
        raise CredentialsError("openai api key is not configured")
    if api_key.strip().startswith("<"):
        raise CredentialsError("openai api key still contains placeholder value")
    return api_key.strip()


@lru_cache(maxsize=1)
def get_gemini_api_key() -> str:
    section = _normalise_llm_section(_load_credentials_raw().get("llm"))
    api_key: Optional[str] = None
    if "gemini" in section and isinstance(section["gemini"], dict):
        api_key = section["gemini"].get("api_key")
    if not api_key:
        api_key = section.get("gemini_api_key")
    if not isinstance(api_key, str) or not api_key.strip():
        raise CredentialsError("gemini api key is not configured")
    if api_key.strip().startswith("<"):
        raise CredentialsError("gemini api key still contains placeholder value")
    return api_key.strip()


def is_provider_configured(provider: str) -> bool:
    provider = provider.lower()
    if provider not in SUPPORTED_PROVIDERS:
        return False
    section = _normalise_llm_section(_load_credentials_optional().get("llm"))
    try:
        if provider == "openai":
            return _provider_has_key(section, "openai")
        if provider == "gemini":
            return _provider_has_key(section, "gemini")
    except CredentialsError:  # pragma: no cover
        return False
    return False


def set_llm_credentials(provider: str, api_key: str, make_active: bool = True) -> None:
    provider = provider.lower()
    if provider not in SUPPORTED_PROVIDERS:
        raise CredentialsError(f"unsupported provider: {provider}")
    key = (api_key or "").strip()
    if not key:
        raise CredentialsError("api key cannot be empty")
    if key.startswith("<"):
        raise CredentialsError("api key still contains placeholder value")

    section = _normalise_llm_section(_load_credentials_optional().get("llm"))
    provider_entry = section.get(provider)
    if not isinstance(provider_entry, dict):
        provider_entry = {}
    provider_entry["api_key"] = key
    section[provider] = provider_entry
    if make_active:
        section["provider"] = provider
    _save_llm_section(section)


def set_openai_api_key(value: str) -> None:
    set_llm_credentials("openai", value, make_active=True)


def reset_cache() -> None:
    get_openai_api_key.cache_clear()
    get_gemini_api_key.cache_clear()
    get_llm_provider.cache_clear()


__all__ = [
    "CredentialsError",
    "SUPPORTED_PROVIDERS",
    "get_llm_provider",
    "get_openai_api_key",
    "get_gemini_api_key",
    "is_provider_configured",
    "set_llm_credentials",
    "set_openai_api_key",
    "reset_cache",
]
