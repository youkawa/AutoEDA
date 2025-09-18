# AutoEDA API (FastAPI) 開発ガイド

`apps/api` は AutoEDA のバックエンドを提供する FastAPI アプリケーションである。`docs/design.md` のアーキテクチャに従い、EDA レポート生成 (A1) からレシピ出力 (D1)、PII/リーク検査 (C1/C2)、LLM 資格情報管理 (S1) までを REST API として公開する。

---

## 1. セットアップ

```bash
cd apps/api
python3 -m venv .venv && source .venv/bin/activate  # 任意
pip install -r requirements.txt
uvicorn apps.api.main:app --reload
```

- 開発用途では `--reload` で自動リロードを有効化。
- `config/credentials.json` が存在しない場合は LLM 呼び出しをスキップし、フォールバック応答を返す。

### データパス

| 種別 | パス | 説明 |
| ---- | ---- | ---- |
| データセット | `data/datasets/<dataset_id>.csv` | `POST /api/datasets/upload` で保存。`.meta.json` に PII/リーク状態を記録 |
| レシピ | `data/recipes/<dataset_id>/` | `recipe.json`, `eda.ipynb`, `sampling.sql` を生成 |
| メトリクス | `data/metrics/events.jsonl` | `metrics.record_event` が JSON Lines で追記 |

---

## 2. エンドポイント一覧

| メソッド/パス | 説明 | 主要実装 |
| ------------- | ---- | -------- |
| `GET /health` | ヘルスチェック | `main.health`
| `POST /api/datasets/upload` | CSV アップロード (≤100MB, ≤50列) | `services.tools.save_dataset`
| `GET /api/datasets` | データセット一覧 | `services.storage.list_datasets`
| `POST /api/eda` | A1 レポート生成 | `services.orchestrator.generate_eda_report`
| `POST /api/charts/suggest` | A2 チャート候補 | `services.tools.chart_api` + `services.evaluator`
| `POST /api/qna` | B1 根拠付き回答 | `services.tools.stats_qna`
| `POST /api/followup` | B1 追質問 | `services.tools.followup`
| `POST /api/actions/prioritize` | B2 次アクション優先度 | `services.tools.prioritize_actions`
| `POST /api/pii/scan` | C1 PII 検出 | `services.tools.pii_scan`
| `POST /api/pii/apply` | C1 マスク適用 | `services.tools.apply_pii_policy`
| `POST /api/leakage/scan` | C2 リーク検査 | `services.tools.leakage_scan`
| `POST /api/leakage/resolve` | C2 対応状態更新 | `services.tools.resolve_leakage`
| `POST /api/recipes/emit` | D1 レシピ生成 | `services.tools.recipe_emit`
| `POST /api/recipes/export` | D1 互換エンドポイント | `main.recipes_export`
| `GET /api/credentials/llm` | LLM 設定状況 | `config.get_llm_provider`
| `POST /api/credentials/llm` | LLM 資格情報更新 | `config.set_llm_credentials`

### サンプル: `/api/eda`

```http
POST /api/eda HTTP/1.1
Content-Type: application/json

{"dataset_id": "ds_ab12"}
```

```json
{
  "summary": {"rows": 1000000, "cols": 48, "missing_rate": 0.12, "type_mix": {"int": 20, "float": 10, "cat": 18}},
  "distributions": [{"column": "price", "dtype": "float", "count": 1000000, "missing": 320000, "histogram": [100,200,500,800,300], "source_ref": {"kind": "figure", "locator": "fig:price_hist"}}],
  "data_quality_report": {"issues": [{"severity": "high", "column": "price", "description": "欠損が多い", "statistic": {"missing_ratio": 0.32}, "evidence": {"kind": "table", "locator": "tbl:price_quality"}}]},
  "next_actions": [{"title": "price 列の欠損補完", "impact": 0.9, "effort": 0.3, "confidence": 0.8, "score": 3.0, "wsjf": 3.0, "rice": 24.3, "dependencies": ["impute_price_mean"]}],
  "references": [{"kind": "table", "locator": "tbl:summary"}]
}
```

### サンプル: `/api/credentials/llm`

```http
GET /api/credentials/llm
```

```json
{
  "provider": "openai",
  "configured": false,
  "providers": {
    "gemini": {"configured": false},
    "openai": {"configured": false}
  }
}
```

```http
POST /api/credentials/llm
Content-Type: application/json

{"provider": "openai", "api_key": "sk-..."}
```

レスポンス: `204 No Content`

---

## 3. 観測 / メトリクス

全エンドポイントは `metrics.record_event` を通じて JSON Lines を `data/metrics/events.jsonl` に追記する。主なイベント:

| イベント名 | 主なフィールド |
| ---------- | -------------- |
| `EDAReportGenerated` | dataset_id, groundedness, duration_ms, fallback_applied |
| `ChartsSuggested` | dataset_id, count, duration_ms |
| `EDAQueryAnswered` | dataset_id, coverage, duration_ms |
| `ActionsPrioritized` | dataset_id, count |
| `PIIMasked` | dataset_id, detected_fields, mask_policy |
| `LeakageRiskFlagged` | dataset_id, flagged, rules_matched |
| `LeakageResolutionApplied` | dataset_id, action, remaining |
| `EDARecipeEmitted` | artifact_hash, files |
| `LLMCredentialsUpdated` | provider, configured |

`python3 apps/api/scripts/check_slo.py` を実行すると、各イベントの p95/groundedness が閾値を超過していないかを検証できる。`python3 apps/api/scripts/check_rag.py` は RAG ゴールデンセットのカバレッジを判定する。

---

## 4. テスト

```bash
# 単体テスト
PYTHONPATH=. pytest tests/python

# OpenAPI スキーマ出力
python3 apps/api/scripts/dump_openapi.py > ../../dist/openapi.json

# SLO / RAG チェック
python3 apps/api/scripts/check_slo.py
python3 apps/api/scripts/check_rag.py
```

- LLM/API Key を設定しない場合でもテストは成功する (フォールバックパスを検証)。
- LLM を用いた統合テストを行う場合は環境変数 `AUTOEDA_CREDENTIALS_FILE` を指定する。

---

## 5. 開発メモ

- 新しいエンドポイントを追加する場合は `packages/schemas` に対応する Zod スキーマを追加し、`client-sdk` 側も更新する。
- メトリクスイベントを忘れずに記録し、`docs/requirements.md` の KPI に追従する。
- `storage.py` がファイルサイズを検証するため、アップロード処理を変更する際は単体テストを追加する。
