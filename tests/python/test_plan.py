from fastapi.testclient import TestClient

from apps.api.main import app


def test_plan_generate_returns_tasks(monkeypatch):
    client = TestClient(app)
    r = client.post('/api/plan/generate', json={'dataset_id': 'ds_001', 'top_k': 3})
    assert r.status_code == 200
    data = r.json()
    assert data['version']
    assert isinstance(data['tasks'], list)
    assert any(t['id'] == 'profile' for t in data['tasks'])
