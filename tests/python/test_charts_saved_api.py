import json
from fastapi.testclient import TestClient

from apps.api.main import app


def _client():
    return TestClient(app)


def test_charts_save_list_and_delete(tmp_path, monkeypatch):
    # 環境: ローカルJSONストアの保存先を一時ディレクトリに向ける
    from apps.api.services import charts_store as store
    # 保存先を一時ファイルに差し替え
    monkeypatch.setattr(store, "_STORE", tmp_path / "saved.json", raising=False)

    client = _client()

    # svg で保存
    svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\"></svg>"
    payload = {
        "dataset_id": "ds_001",
        "chart_id": "c-bar",
        "title": "棒グラフ",
        "hint": "bar",
        "svg": svg,
    }
    res = client.post("/api/charts/save", json=payload)
    assert res.status_code == 200, res.text
    saved = res.json()
    assert saved["id"] and saved["dataset_id"] == "ds_001"
    assert saved["svg"] and saved["vega"] is None

    # vega で保存（別データセット）
    vega_spec = {"mark": "bar", "data": {"values": [{"x": 1, "y": 2}]}}
    res2 = client.post("/api/charts/save", json={
        "dataset_id": "ds_002",
        "chart_id": "c-bar",
        "title": "bar vega",
        "hint": "bar",
        "vega": vega_spec,
    })
    assert res2.status_code == 200, res2.text

    # list（全件）
    all_items = client.get("/api/charts/list").json()
    assert len(all_items) == 2

    # list（dataset_id フィルタ）
    ds1_items = client.get("/api/charts/list", params={"dataset_id": "ds_001"}).json()
    assert len(ds1_items) == 1 and ds1_items[0]["dataset_id"] == "ds_001"

    # delete（存在）
    del_id = saved["id"]
    del_res = client.delete(f"/api/charts/{del_id}")
    assert del_res.status_code == 200 and del_res.json().get("deleted") is True

    # delete（404）
    del_res2 = client.delete("/api/charts/does-not-exist")
    assert del_res2.status_code == 404


def test_charts_save_requires_svg_or_vega(tmp_path, monkeypatch):
    from apps.api.services import charts_store as store
    monkeypatch.setattr(store, "_STORE", tmp_path / "saved.json", raising=False)
    client = _client()
    res = client.post("/api/charts/save", json={"dataset_id": "ds_001"})
    assert res.status_code == 400
