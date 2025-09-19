import time
from fastapi.testclient import TestClient

from apps.api.main import app
from apps.api.services import charts as chartsvc


def test_charts_generate_sync():
    # 確実に同期モード
    chartsvc._ASYNC = False
    client = TestClient(app)
    resp = client.post('/api/charts/generate', json={'dataset_id': 'ds_sync', 'spec_hint': 'bar'})
    assert resp.status_code == 200
    data = resp.json()
    assert data['status'] == 'succeeded'
    assert data['result'] and data['result']['outputs'][0]['mime'] == 'image/svg+xml'
    # GET /jobs/{id}
    job = client.get(f"/api/charts/jobs/{data['job_id']}")
    assert job.status_code == 200


def test_charts_generate_async_and_batch_polling():
    # 非同期モード
    chartsvc._ASYNC = True
    client = TestClient(app)
    r = client.post('/api/charts/generate', json={'dataset_id': 'ds_async', 'spec_hint': 'line'})
    assert r.status_code == 200
    job = r.json()
    assert job['status'] in ('queued', 'running', 'succeeded')

    # poll until succeeded (<= 3s)
    t0 = time.time()
    while time.time() - t0 < 3.0:
        j = client.get(f"/api/charts/jobs/{job['job_id']}").json()
        if j['status'] == 'succeeded':
            break
        time.sleep(0.05)
    else:
        raise AssertionError('job did not complete in time')

    # batch
    r2 = client.post('/api/charts/generate-batch', json={'dataset_id': 'ds_async', 'items': [
        {'dataset_id': 'ds_async', 'spec_hint': 'bar', 'chart_id': 'c-bar'},
        {'dataset_id': 'ds_async', 'spec_hint': 'scatter', 'chart_id': 'c-scat'}
    ]})
    assert r2.status_code == 200
    b = r2.json()
    assert b['total'] == 2
    # poll batches until results appear
    t0 = time.time()
    while time.time() - t0 < 3.0:
        st = client.get(f"/api/charts/batches/{b['batch_id']}").json()
        if st.get('results'):
            assert len(st['results']) == 2
            # results_map preserves mapping by chart_id
            assert 'results_map' in st
            assert set(st['results_map'].keys()) == {'c-bar', 'c-scat'}
            break
        time.sleep(0.05)
    else:
        raise AssertionError('batch did not complete in time')
