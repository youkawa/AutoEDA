# AutoEDA API (FastAPI)

設計（docs/design.md, docs/requirements.md）に準拠した最小エンドポイントを実装。

- `POST /api/eda` — EDA レポート（構造化JSON）。
- `POST /api/charts/suggest` — チャート候補（k件）+ consistency_score。
- `POST /api/qna` — 根拠付き回答（coverage>=0.8を想定。モック値）。
- `POST /api/actions/prioritize` — next_actions に score を付与し降順返却。
- `POST /api/pii/scan` — 典型PIIの簡易検出（デモ）。
- `POST /api/leakage/scan` — 既知パターンの簡易フラグ（デモ）。

観測イベントは `print({...})` で JSON を標準出力へ記録（将来はOTel等へ移行）。

## 開発

```
uvicorn apps.api.main:app --reload
```

