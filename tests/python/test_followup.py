from fastapi.testclient import TestClient

from apps.api.main import app


def test_followup_endpoint_returns_answers(monkeypatch):
    client = TestClient(app)
    resp = client.post('/api/followup', json={'dataset_id': 'ds_001', 'question': '追加分析は？'})
    assert resp.status_code == 200
    data = resp.json()
    assert 'answers' in data
    assert data['answers'][0]['coverage'] >= 0.8
