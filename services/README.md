# services/

`apps/api/services` 以下に実装されているバックエンドサービスモジュールの責務一覧。以前はプレースホルダだったが、現在は以下の構成で稼働している。

| モジュール | 主な関数 | 役割 |
| ---------- | -------- | ---- |
| `tools.py` | `profile_api`, `chart_api`, `stats_qna`, `followup`, `prioritize_actions`, `pii_scan`, `apply_pii_policy`, `leakage_scan`, `resolve_leakage`, `recipe_emit`, `save_dataset` | CSV プロファイル生成、チャート候補分析、Q&A テンプレート、優先度計算、PII/リーク検査、レシピ生成、アップロード処理など、各ストーリーのビジネスロジックを集約 |
| `orchestrator.py` | `generate_eda_report` | プロファイル結果 + PII/リーク結果を統合し、LLM (OpenAI/Gemini) を呼び出して補足要約を追加。失敗時はツールのみでフォールバック |
| `evaluator.py` | `consistency_ok`, `coverage_ok` | チャート説明と統計の整合チェック、Q&A 引用被覆率チェック |
| `rag.py` | `load_default_corpus`, `retrieve`, `ingest`, `evaluate_golden_queries` | RAG 用ドキュメント管理。Chroma が利用可能なら永続化、それ以外はインメモリ検索 |
| `recipes.py` | `build_artifacts`, `compute_summary`, `within_tolerance`, `hash_files` | レシピファイル (`recipe.json`/`eda.ipynb`/`sampling.sql`) を生成し、統計再現性を検証 |
| `storage.py` | `save_upload`, `list_datasets`, `update_pii_metadata`, `update_leakage_metadata` | `data/datasets` 以下のファイル管理とメタデータ更新 |
| `metrics.py` | `record_event`, `persist_event`, `detect_violations`, `slo_snapshot` | メトリクスのインメモリアグリゲーションと JSON Lines 永続化、SLO 判定補助 |
| `config.py` | `get_llm_provider`, `set_llm_credentials`, `get_openai_api_key`, `get_gemini_api_key` | `config/credentials.json` の読み書き、環境変数 (`AUTOEDA_CREDENTIALS_FILE`) からのパス切り替え |

## 使い方メモ

- いずれも FastAPI から直接 import されることを前提としており、副作用は最小限に抑えている。
- LLM 連携は `OpenAI` / `google.generativeai` SDK を直接利用。依存がインストールされていない場合は例外を投げ、フォールバックで吸収する設計になっている。
- RAG のデフォルトコーパスは `docs/requirements.md` / `docs/design.md` を読み込む。追加ドキュメントを ingest する場合は JSON 形式で `rag.ingest` に渡す。
- メトリクスイベントは CI の SLO チェックで利用するため、サービス関数を追加する際は `metrics.record_event` を忘れずに呼び出すこと。

## テスト

- `tests/python` に対象モジュールの単体テストを追加する。pandas や外部 SDK に依存する箇所は `pytest-mock` でモック化する。
- フォールバック経路 (例: pandas 不在、LLM 未設定) も必ずテストする。

## 今後の計画

- `services/` 配下に将来的なマイクロサービス分割案 (例: `orchestrator/`, `tools/`, `rag/`) を配置予定だが、現時点では `apps/api/services` を単一ソースとして管理する。
