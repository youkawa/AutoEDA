import json
import os
from pathlib import Path
from typing import Any, Dict

from fastapi.testclient import TestClient

from apps.api import config as app_config
from apps.api import main as api


SUPPORTED = {"openai", "gemini"}


def create_client(tmp_path: Path) -> TestClient:
    credentials_path = tmp_path / "credentials.json"
    credentials_path.parent.mkdir(parents=True, exist_ok=True)
    os.environ["AUTOEDA_CREDENTIALS_FILE"] = str(credentials_path)
    app_config.reset_cache()
    return TestClient(api.app)


def read_credentials_file() -> Dict[str, Any]:
    file_path = Path(os.environ["AUTOEDA_CREDENTIALS_FILE"])
    return json.loads(file_path.read_text(encoding="utf-8"))


def test_get_status_defaults_to_openai(tmp_path):
    client = create_client(tmp_path)
    response = client.get("/api/credentials/llm")
    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "openai"
    assert body["configured"] is False
    assert set(body["providers"].keys()) == SUPPORTED


def test_set_openai_credentials_and_status(tmp_path):
    client = create_client(tmp_path)

    res = client.post(
        "/api/credentials/llm",
        json={"provider": "openai", "api_key": "sk-openai-1234567890"},
    )
    assert res.status_code == 204

    data = read_credentials_file()
    assert data["llm"]["provider"] == "openai"
    assert data["llm"]["openai"]["api_key"] == "sk-openai-1234567890"

    status = client.get("/api/credentials/llm").json()
    assert status["provider"] == "openai"
    assert status["configured"] is True
    assert status["providers"]["openai"]["configured"] is True
    assert status["providers"]["gemini"]["configured"] is False


def test_set_gemini_credentials_switches_provider(tmp_path):
    client = create_client(tmp_path)

    res = client.post(
        "/api/credentials/llm",
        json={"provider": "gemini", "api_key": "gm-test-abcdef"},
    )
    assert res.status_code == 204

    data = read_credentials_file()
    assert data["llm"]["provider"] == "gemini"
    assert data["llm"]["gemini"]["api_key"] == "gm-test-abcdef"

    status = client.get("/api/credentials/llm").json()
    assert status["provider"] == "gemini"
    assert status["configured"] is True
    assert status["providers"]["gemini"]["configured"] is True
    assert status["providers"]["openai"]["configured"] is False


def test_legacy_payload_is_supported(tmp_path):
    client = create_client(tmp_path)

    res = client.post(
        "/api/credentials/llm",
        json={"openai_api_key": "sk-openai-legacy"},
    )
    assert res.status_code == 204

    data = read_credentials_file()
    assert data["llm"]["openai"]["api_key"] == "sk-openai-legacy"
