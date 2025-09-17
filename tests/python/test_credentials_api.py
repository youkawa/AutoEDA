from fastapi.testclient import TestClient
import json
import os
from pathlib import Path

from apps.api import main as api
from apps.api import config as app_config


def create_client(tmp_path: Path) -> TestClient:
    credentials_path = tmp_path / "credentials.json"
    credentials_path.parent.mkdir(parents=True, exist_ok=True)
    os.environ["AUTOEDA_CREDENTIALS_FILE"] = str(credentials_path)
    app_config.reset_cache()
    return TestClient(api.app)


def test_get_status_without_credentials(tmp_path):
    client = create_client(tmp_path)
    response = client.get("/api/credentials/llm")
    assert response.status_code == 200
    assert response.json() == {"configured": False}


def test_set_credentials_and_persist(tmp_path):
    client = create_client(tmp_path)

    response = client.post(
        "/api/credentials/llm",
        json={"openai_api_key": "sk-test-1234567890"},
    )
    assert response.status_code == 204

    file_path = Path(os.environ["AUTOEDA_CREDENTIALS_FILE"])
    data = json.loads(file_path.read_text(encoding="utf-8"))
    assert data["llm"]["openai_api_key"] == "sk-test-1234567890"

    status_response = client.get("/api/credentials/llm")
    assert status_response.status_code == 200
    assert status_response.json() == {"configured": True}
